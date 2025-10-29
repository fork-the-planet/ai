import { env } from "cloudflare:workers";
import type {
	AuthRequest,
	OAuthHelpers,
	TokenExchangeCallbackOptions,
	TokenExchangeCallbackResult,
} from "@cloudflare/workers-oauth-provider";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import * as oauth from "oauth4webapi";

import type { UserProps } from "./types";
import {
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	addApprovedClient,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
} from "./workers-oauth-utils";

type Auth0AuthRequest = {
	mcpAuthRequest: AuthRequest;
	codeVerifier: string;
	codeChallenge: string;
	nonce: string;
	transactionState: string;
	consentToken: string;
};

export async function getOidcConfig({
	issuer,
	client_id,
	client_secret,
}: {
	issuer: string;
	client_id: string;
	client_secret: string;
}) {
	const as = await oauth
		.discoveryRequest(new URL(issuer), { algorithm: "oidc" })
		.then((response) => oauth.processDiscoveryResponse(new URL(issuer), response));

	const client: oauth.Client = { client_id };
	const clientAuth = oauth.ClientSecretPost(client_secret);

	return { as, client, clientAuth };
}

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Authorization Code Flow when a user wants to log in.
 * It checks if the client is already approved, and if not, shows a consent screen.
 * Uses secure state management with KV storage and CSRF protection.
 */
export async function authorize(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
	const mcpClientAuthRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!mcpClientAuthRequest.clientId) {
		return c.text("Invalid request", 400);
	}

	const client = await c.env.OAUTH_PROVIDER.lookupClient(mcpClientAuthRequest.clientId);
	if (!client) {
		return c.text("Invalid client", 400);
	}

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, mcpClientAuthRequest.clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
		// Skip approval dialog but still use secure state management
		// Generate all that is needed for the Auth0 auth request
		const codeVerifier = oauth.generateRandomCodeVerifier();
		const nonce = oauth.generateRandomNonce();
		const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

		const auth0AuthRequest: Auth0AuthRequest = {
			codeChallenge,
			codeVerifier,
			consentToken: "", // Not needed for approved clients
			mcpAuthRequest: mcpClientAuthRequest,
			nonce,
			transactionState: "",
		};

		// Create OAuth state in KV (secure, one-time use)
		const { stateToken } = await createOAuthState(
			{ ...mcpClientAuthRequest, auth0Data: auth0AuthRequest },
			c.env.OAUTH_KV,
		);

		// Redirect directly to Auth0
		const { as } = await getOidcConfig({
			client_id: c.env.AUTH0_CLIENT_ID,
			client_secret: c.env.AUTH0_CLIENT_SECRET,
			issuer: `https://${c.env.AUTH0_DOMAIN}/`,
		});

		const authorizationUrl = new URL(as.authorization_endpoint!);
		authorizationUrl.searchParams.set("client_id", c.env.AUTH0_CLIENT_ID);
		authorizationUrl.searchParams.set("redirect_uri", new URL("/callback", c.req.url).href);
		authorizationUrl.searchParams.set("response_type", "code");
		authorizationUrl.searchParams.set("audience", c.env.AUTH0_AUDIENCE);
		authorizationUrl.searchParams.set("scope", c.env.AUTH0_SCOPE);
		authorizationUrl.searchParams.set("code_challenge", codeChallenge);
		authorizationUrl.searchParams.set("code_challenge_method", "S256");
		authorizationUrl.searchParams.set("nonce", nonce);
		authorizationUrl.searchParams.set("state", stateToken);

		return c.redirect(authorizationUrl.href);
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie: csrfCookie } = generateCSRFProtection();

	// Generate Auth0 request data for the consent screen
	const codeVerifier = oauth.generateRandomCodeVerifier();
	const nonce = oauth.generateRandomNonce();
	const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

	const auth0AuthRequest: Auth0AuthRequest = {
		codeChallenge,
		codeVerifier,
		consentToken: "", // Not used anymore, replaced by CSRF token
		mcpAuthRequest: mcpClientAuthRequest,
		nonce,
		transactionState: "",
	};

	// Render the approval dialog with CSRF protection
	return renderApprovalDialog(c.req.raw, {
		client,
		csrfToken,
		server: {
			description: "This is an Auth0 OIDC Proxy Demo MCP Server.",
			logo: undefined,
			name: "Auth0 OIDC Proxy Demo",
		},
		setCookie: csrfCookie,
		state: { oauthReqInfo: mcpClientAuthRequest, auth0Data: auth0AuthRequest },
	});
}

/**
 * Consent Confirmation Endpoint (POST /authorize)
 *
 * This route handles the consent confirmation after the user approves the consent screen.
 * It validates CSRF tokens, adds the client to approved list, and redirects to Auth0.
 */
export async function confirmConsent(
	c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>,
) {
	try {
		// Read form data once
		const formData = await c.req.formData();

		// Validate CSRF token (throws OAuthError on failure)
		const { clearCookie: clearCsrfCookie } = validateCSRFToken(formData, c.req.raw);

		// Extract state from form data
		const encodedState = formData.get("state");
		if (!encodedState || typeof encodedState !== "string") {
			return c.text("Missing state in form data", 400);
		}

		let state: { oauthReqInfo?: AuthRequest; auth0Data?: Auth0AuthRequest };
		try {
			state = JSON.parse(atob(encodedState));
		} catch (_e) {
			return c.text("Invalid state data", 400);
		}

		if (!state.oauthReqInfo || !state.oauthReqInfo.clientId || !state.auth0Data) {
			return c.text("Invalid request", 400);
		}

		// Add client to approved list
		const approvedClientCookie = await addApprovedClient(
			c.req.raw,
			state.oauthReqInfo.clientId,
			c.env.COOKIE_ENCRYPTION_KEY,
		);

		// Create OAuth state in KV (secure, one-time use)
		const { stateToken } = await createOAuthState(
			{ ...state.oauthReqInfo, auth0Data: state.auth0Data },
			c.env.OAUTH_KV,
		);

		// Get Auth0 configuration
		const { as } = await getOidcConfig({
			client_id: c.env.AUTH0_CLIENT_ID,
			client_secret: c.env.AUTH0_CLIENT_SECRET,
			issuer: `https://${c.env.AUTH0_DOMAIN}/`,
		});

		// Redirect to Auth0's authorization endpoint
		const authorizationUrl = new URL(as.authorization_endpoint!);
		authorizationUrl.searchParams.set("client_id", c.env.AUTH0_CLIENT_ID);
		authorizationUrl.searchParams.set("redirect_uri", new URL("/callback", c.req.url).href);
		authorizationUrl.searchParams.set("response_type", "code");
		authorizationUrl.searchParams.set("audience", c.env.AUTH0_AUDIENCE);
		authorizationUrl.searchParams.set("scope", c.env.AUTH0_SCOPE);
		authorizationUrl.searchParams.set("code_challenge", state.auth0Data.codeChallenge);
		authorizationUrl.searchParams.set("code_challenge_method", "S256");
		authorizationUrl.searchParams.set("nonce", state.auth0Data.nonce);
		authorizationUrl.searchParams.set("state", stateToken);

		// Return redirect with cleared CSRF cookie and new approved client cookie
		return new Response(null, {
			status: 302,
			headers: {
				Location: authorizationUrl.href,
				"Set-Cookie": approvedClientCookie,
			},
		});
	} catch (error: any) {
		console.error("POST /authorize error:", error);
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text(`Internal server error: ${error.message}`, 500);
	}
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Auth0 after user authentication.
 * It validates the OAuth state, exchanges the authorization code for tokens,
 * and completes the authorization process.
 */
export async function callback(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
	// Validate OAuth state (retrieves stored data from KV)
	let storedData: AuthRequest & { auth0Data?: Auth0AuthRequest };

	try {
		const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
		storedData = result.oauthReqInfo as AuthRequest & { auth0Data?: Auth0AuthRequest };
	} catch (error: any) {
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text("Internal server error", 500);
	}

	if (!storedData.clientId || !storedData.auth0Data) {
		return c.text("Invalid OAuth request data", 400);
	}

	const auth0AuthRequest = storedData.auth0Data;
	const stateParam = c.req.query("state") as string;

	const { as, client, clientAuth } = await getOidcConfig({
		client_id: c.env.AUTH0_CLIENT_ID,
		client_secret: c.env.AUTH0_CLIENT_SECRET,
		issuer: `https://${c.env.AUTH0_DOMAIN}/`,
	});

	// Perform the Code Exchange
	const params = oauth.validateAuthResponse(as, client, new URL(c.req.url), stateParam);
	const response = await oauth.authorizationCodeGrantRequest(
		as,
		client,
		clientAuth,
		params,
		new URL("/callback", c.req.url).href,
		auth0AuthRequest.codeVerifier,
	);

	// Process the response
	const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
		expectedNonce: auth0AuthRequest.nonce,
		requireIdToken: true,
	});

	// Get the claims from the id_token
	const claims = oauth.getValidatedIdTokenClaims(result);
	if (!claims) {
		return c.text("Received invalid id_token from Auth0", 400);
	}

	// Complete the authorization
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: claims.name || claims.email || claims.sub,
		},
		props: {
			claims: claims,
			tokenSet: {
				accessToken: result.access_token,
				accessTokenTTL: result.expires_in,
				idToken: result.id_token,
				refreshToken: result.refresh_token,
			},
		} as UserProps,
		request: storedData,
		scope: storedData.scope,
		userId: claims.sub!,
	});

	return Response.redirect(redirectTo);
}

/**
 * Token Exchange Callback
 *
 * This function handles the token exchange callback for the CloudflareOAuth Provider and allows us to then interact with the Upstream IdP (your Auth0 tenant)
 */
export async function tokenExchangeCallback(
	options: TokenExchangeCallbackOptions,
): Promise<TokenExchangeCallbackResult | void> {
	// During the Authorization Code Exchange, we want to make sure that the Access Token issued
	// by the MCP Server has the same TTL as the one issued by Auth0.
	if (options.grantType === "authorization_code") {
		return {
			accessTokenTTL: options.props.tokenSet.accessTokenTTL,
			newProps: {
				...options.props,
			},
		};
	}

	if (options.grantType === "refresh_token") {
		const auth0RefreshToken = options.props.tokenSet.refreshToken;
		if (!auth0RefreshToken) {
			throw new Error("No Auth0 refresh token found");
		}

		const { as, client, clientAuth } = await getOidcConfig({
			client_id: env.AUTH0_CLIENT_ID,
			client_secret: env.AUTH0_CLIENT_SECRET,
			issuer: `https://${env.AUTH0_DOMAIN}/`,
		});

		// Perform the refresh token exchange with Auth0.
		const response = await oauth.refreshTokenGrantRequest(
			as,
			client,
			clientAuth,
			auth0RefreshToken,
		);
		const refreshTokenResponse = await oauth.processRefreshTokenResponse(as, client, response);

		// Get the claims from the id_token
		const claims = oauth.getValidatedIdTokenClaims(refreshTokenResponse);
		if (!claims) {
			throw new Error("Received invalid id_token from Auth0");
		}

		// Store the new token set and claims.
		return {
			accessTokenTTL: refreshTokenResponse.expires_in,
			newProps: {
				...options.props,
				claims: claims,
				tokenSet: {
					accessToken: refreshTokenResponse.access_token,
					accessTokenTTL: refreshTokenResponse.expires_in,
					idToken: refreshTokenResponse.id_token,
					refreshToken: refreshTokenResponse.refresh_token || auth0RefreshToken,
				},
			},
		};
	}
}

