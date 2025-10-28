import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { type AccessToken, type AuthenticationResponse, WorkOS } from "@workos-inc/node";
import { Hono } from "hono";
import * as jose from "jose";
import type { Props } from "./props";
import {
	addApprovedClient,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	type OAuthUtilsConfig,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
} from "./workers-oauth-utils";

const app = new Hono<{
	Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
	Variables: { workOS: WorkOS };
}>();

app.use(async (c, next) => {
	c.set("workOS", new WorkOS(c.env.WORKOS_CLIENT_SECRET));
	await next();
});

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	const config: OAuthUtilsConfig = {
		clientName: "authkit",
		cookieSecret: c.env.COOKIE_ENCRYPTION_KEY,
		kv: c.env.OAUTH_KV,
	};

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, clientId, config)) {
		// Skip approval dialog but still create secure state
		const { stateToken, setCookie } = await createOAuthState(oauthReqInfo, config);
		return redirectToAuthKit(c, stateToken, { "Set-Cookie": setCookie });
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie } = generateCSRFProtection(config);

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description: "This MCP Server is a demo for WorkOS AuthKit OAuth.",
			name: "AuthKit OAuth Demo",
		},
		setCookie,
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	const config: OAuthUtilsConfig = {
		clientName: "authkit",
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

	return redirectToAuthKit(c, stateToken, { "Set-Cookie": cookies.join(", ") });
});

function redirectToAuthKit(c: any, stateToken: string, headers: Record<string, string> = {}) {
	const workOS = c.get("workOS");
	return new Response(null, {
		headers: {
			...headers,
			location: workOS.userManagement.getAuthorizationUrl({
				provider: "authkit",
				clientId: c.env.WORKOS_CLIENT_ID,
				redirectUri: new URL("/callback", c.req.url).href,
				state: stateToken,
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from WorkOS AuthKit after user authentication.
 * It validates the state, exchanges the temporary code for an access token,
 * then stores user metadata & the auth token as part of the 'props' on the token
 * passed down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	const config: OAuthUtilsConfig = {
		clientName: "authkit",
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

	const workOS = c.get("workOS");
	let response: AuthenticationResponse;
	try {
		response = await workOS.userManagement.authenticateWithCode({
			clientId: c.env.WORKOS_CLIENT_ID,
			code,
		});
	} catch (error) {
		console.error("Authentication error:", error);
		return c.text("Invalid authorization code", 400);
	}

	const { accessToken, organizationId, refreshToken, user } = response;
	const { permissions = [] } = jose.decodeJwt<AccessToken>(accessToken);

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: user.id,
		metadata: {},
		scope: permissions,

		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			organizationId,
			permissions,
			refreshToken,
			user,
		} satisfies Props,
	});

	return new Response(null, {
		headers: {
			Location: redirectTo,
			"Set-Cookie": clearCookie,
		},
		status: 302,
	});
});

export const AuthkitHandler = app;
