import {
  OAUTH_READ_SCOPE,
  createAuthorizationCode,
  getMcpResource,
  getProtectedResourceMetadataUrl,
  getPublicBaseUrl,
  getWwwAuthenticateHeader,
  isAllowedRedirectUri,
  parseScopes,
  scopeString,
  validateConsentCode,
  getConsentCodeConfigured,
} from "@/lib/mcpOAuth";

export const runtime = "nodejs";

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderConsentPage(request: Request, message = "") {
  const url = new URL(request.url);
  const hiddenInputs = Array.from(url.searchParams.entries())
    .filter(([key]) => !["access_code", "learner_email"].includes(key))
    .map(([key, value]) => `<input type="hidden" name="${htmlEscape(key)}" value="${htmlEscape(value)}" />`)
    .join("\n");

  const scopes = htmlEscape(scopeString(parseScopes(url.searchParams.get("scope") || OAUTH_READ_SCOPE)));
  const origin = htmlEscape(getPublicBaseUrl(request));
  const protectedResource = htmlEscape(getProtectedResourceMetadataUrl(request));

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize English OS</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 560px; margin: 48px auto; background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { line-height: 1.5; color: #475569; }
      label { display: block; font-weight: 650; margin: 18px 0 8px; }
      input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; }
      button { margin-top: 22px; width: 100%; border: 0; border-radius: 999px; padding: 12px 18px; font-weight: 700; background: #0f172a; color: white; cursor: pointer; }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }
      .message { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; padding: 10px 12px; border-radius: 10px; margin: 16px 0; }
      .small { font-size: 13px; color: #64748b; }
    </style>
  </head>
  <body>
    <main>
      <h1>Authorize English OS</h1>
      <p>ChatGPT is requesting access to English OS tools through this MCP server.</p>
      ${message ? `<div class="message">${htmlEscape(message)}</div>` : ""}
      <p><strong>Scopes:</strong> <code>${scopes}</code></p>
      <p class="small">Issuer: ${origin}<br />Protected resource metadata: ${protectedResource}</p>
      <form method="GET" action="/api/oauth/authorize">
        ${hiddenInputs}
        <label for="learner_email">Learner email</label>
        <input id="learner_email" name="learner_email" type="email" placeholder="Learner email" autocomplete="email" />
        <label for="access_code">English OS authorization code</label>
        <input id="access_code" name="access_code" type="password" autocomplete="one-time-code" required autofocus />
        <button type="submit">Authorize ChatGPT</button>
      </form>
      <p class="small">Use the dedicated consent code configured in Vercel. If not configured, use the English OS MCP token.</p>
    </main>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

function errorResponse(request: Request, message: string, status = 400) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": getWwwAuthenticateHeader(request),
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type") || "";
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "";
  const resource = url.searchParams.get("resource") || getMcpResource(request);
  const scope = scopeString(parseScopes(url.searchParams.get("scope") || OAUTH_READ_SCOPE));
  const accessCode = url.searchParams.get("access_code") || "";
  const learnerEmail = url.searchParams.get("learner_email") || process.env.ENGLISH_OS_OAUTH_DEFAULT_USER_EMAIL || "english-os-user";

  if (responseType !== "code") return errorResponse(request, "Unsupported response_type. Expected code.");
  if (!clientId) return errorResponse(request, "Missing client_id.");
  if (!redirectUri) return errorResponse(request, "Missing redirect_uri.");
  if (!isAllowedRedirectUri(redirectUri)) return errorResponse(request, "redirect_uri is not allowed.");
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return errorResponse(request, "PKCE S256 code_challenge is required.");
  }
  if (resource !== getMcpResource(request)) {
    return errorResponse(request, "Invalid resource parameter.");
  }
  if (!getConsentCodeConfigured()) {
    return errorResponse(request, "Server is missing ENGLISH_OS_OAUTH_CONSENT_CODE or ENGLISH_OS_MCP_TOKEN.", 500);
  }

  if (!accessCode) {
    return renderConsentPage(request);
  }

  if (!validateConsentCode(accessCode)) {
    return renderConsentPage(request, "Invalid authorization code. Try again.");
  }

  const code = createAuthorizationCode({
    request,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    resource,
    subject: learnerEmail,
    email: learnerEmail,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return Response.redirect(redirect.toString(), 302);
}
