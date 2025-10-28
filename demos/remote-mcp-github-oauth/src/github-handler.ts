import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { Octokit } from "octokit";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils";
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

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }

  const config: OAuthUtilsConfig = {
    clientName: "github",
    cookieSecret: env.COOKIE_ENCRYPTION_KEY,
    kv: c.env.OAUTH_KV,
  };

  // Check if client is already approved
  if (await isClientApproved(c.req.raw, clientId, config)) {
    // Skip approval dialog but still create secure state
    const { stateToken, setCookie } = await createOAuthState(oauthReqInfo, config);
    return redirectToGithub(c.req.raw, stateToken, { "Set-Cookie": setCookie });
  }

  // Generate CSRF protection for the approval form
  const { token: csrfToken, setCookie } = generateCSRFProtection(config);

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    csrfToken,
    server: {
      description: "This is a demo MCP Remote Server using GitHub for authentication.",
      logo: "https://avatars.githubusercontent.com/u/314135?s=200&v=4",
      name: "Cloudflare GitHub MCP Server",
    },
    setCookie,
    state: { oauthReqInfo },
  });
});

app.post("/authorize", async (c) => {
  const config: OAuthUtilsConfig = {
    clientName: "github",
    cookieSecret: env.COOKIE_ENCRYPTION_KEY,
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
  const approvedClientCookie = await addApprovedClient(c.req.raw, state.oauthReqInfo.clientId, config);

  // Create OAuth state with CSRF protection
  const { stateToken, setCookie } = await createOAuthState(state.oauthReqInfo, config);

  // Combine cookies
  const cookies = [approvedClientCookie, setCookie];

  return redirectToGithub(c.req.raw, stateToken, { "Set-Cookie": cookies.join(", ") });
});

async function redirectToGithub(request: Request, stateToken: string, headers: Record<string, string> = {}) {
  return new Response(null, {
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: new URL("/callback", request.url).href,
        scope: "read:user",
        state: stateToken,
        upstream_url: "https://github.com/login/oauth/authorize",
      }),
    },
    status: 302,
  });
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from GitHub after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
  const config: OAuthUtilsConfig = {
    clientName: "github",
    cookieSecret: env.COOKIE_ENCRYPTION_KEY,
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
  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    code: c.req.query("code"),
    redirect_uri: new URL("/callback", c.req.url).href,
    upstream_url: "https://github.com/login/oauth/access_token",
  });
  if (errResponse) return errResponse;

  // Fetch the user info from GitHub
  const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
  const { login, name, email } = user.data;

  // Return back to the MCP client a new token
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    metadata: {
      label: name,
    },
    // This will be available on this.props inside MyMCP
    props: {
      accessToken,
      email,
      login,
      name,
    } as Props,
    request: oauthReqInfo,
    scope: oauthReqInfo.scope,
    userId: login,
  });

  return new Response(null, {
    headers: {
      Location: redirectTo,
      "Set-Cookie": clearCookie,
    },
    status: 302,
  });
});

export { app as GitHubHandler };
