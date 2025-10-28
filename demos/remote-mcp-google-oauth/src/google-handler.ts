import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils";
import {
	addApprovedClient,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
	type OAuthUtilsConfig,
} from "./workers-oauth-utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	const config: OAuthUtilsConfig = {
		clientName: "google",
		cookieSecret: c.env.COOKIE_ENCRYPTION_KEY,
		kv: c.env.OAUTH_KV,
	};

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, clientId, config)) {
		// Skip approval dialog but still create secure state
		const { stateToken, setCookie } = await createOAuthState(oauthReqInfo, config);
		return redirectToGoogle(c.req.raw, c.env, stateToken, { "Set-Cookie": setCookie });
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie } = generateCSRFProtection(config);

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description: "This MCP Server is a demo for Google OAuth.",
			name: "Google OAuth Demo",
		},
		setCookie,
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	const config: OAuthUtilsConfig = {
		clientName: "google",
		cookieSecret: c.env.COOKIE_ENCRYPTION_KEY,
		kv: c.env.OAUTH_KV,
	};

	// Validate CSRF token
	try {
		await validateCSRFToken(c.req.raw, config);
	} catch (error: any) {
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text("Internal server error", 500);
	}

	// Extract state from form data
	const formData = await c.req.raw.formData();
	const encodedState = formData.get("state");
	if (!encodedState || typeof encodedState !== "string") {
		return c.text("Missing state in form data", 400);
	}

	let state: { oauthReqInfo?: AuthRequest };
	try {
		state = JSON.parse(atob(encodedState));
	} catch (_e) {
		return c.text("Invalid state data", 400);
	}

	if (!state.oauthReqInfo || !state.oauthReqInfo.clientId) {
		return c.text("Invalid request", 400);
	}

	// Add client to approved list
	const approvedClientCookie = await addApprovedClient(
		c.req.raw,
		state.oauthReqInfo.clientId,
		config,
	);

	// Create OAuth state with CSRF protection
	const { stateToken, setCookie } = await createOAuthState(state.oauthReqInfo, config);

	// Combine cookies
	const cookies = [approvedClientCookie, setCookie];

	return redirectToGoogle(c.req.raw, c.env, stateToken, { "Set-Cookie": cookies.join(", ") });
});

async function redirectToGoogle(
	request: Request,
	env: Env,
	stateToken: string,
	headers: Record<string, string> = {},
) {
	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				clientId: env.GOOGLE_CLIENT_ID,
				hostedDomain: env.HOSTED_DOMAIN,
				redirectUri: new URL("/callback", request.url).href,
				scope: "email profile",
				state: stateToken,
				upstreamUrl: "https://accounts.google.com/o/oauth2/v2/auth",
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Google after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	const config: OAuthUtilsConfig = {
		clientName: "google",
		cookieSecret: c.env.COOKIE_ENCRYPTION_KEY,
		kv: c.env.OAUTH_KV,
	};

	// Validate OAuth state (checks query param matches cookie and retrieves stored data)
	let oauthReqInfo: AuthRequest;
	let clearCookie: string;

	try {
		const result = await validateOAuthState(c.req.raw, config);
		oauthReqInfo = result.oauthReqInfo;
		clearCookie = result.clearCookie;
	} catch (error: any) {
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text("Internal server error", 500);
	}

	if (!oauthReqInfo.clientId) {
		return c.text("Invalid OAuth request data", 400);
	}

	// Exchange the code for an access token
	const code = c.req.query("code");
	if (!code) {
		return c.text("Missing code", 400);
	}

	const [accessToken, googleErrResponse] = await fetchUpstreamAuthToken({
		clientId: c.env.GOOGLE_CLIENT_ID,
		clientSecret: c.env.GOOGLE_CLIENT_SECRET,
		code,
		grantType: "authorization_code",
		redirectUri: new URL("/callback", c.req.url).href,
		upstreamUrl: "https://accounts.google.com/o/oauth2/token",
	});
	if (googleErrResponse) {
		return googleErrResponse;
	}

	// Fetch the user info from Google
	const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	if (!userResponse.ok) {
		return c.text(`Failed to fetch user info: ${await userResponse.text()}`, 500);
	}

	const { id, name, email } = (await userResponse.json()) as {
		id: string;
		name: string;
		email: string;
	};

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name,
		},
		props: {
			accessToken,
			email,
			name,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: id,
	});

	return new Response(null, {
		headers: {
			Location: redirectTo,
			"Set-Cookie": clearCookie,
		},
		status: 302,
	});
});

export { app as GoogleHandler };
