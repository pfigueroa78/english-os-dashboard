import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

export const OAUTH_READ_SCOPE = "english_os.read";
export const OAUTH_WRITE_SCOPE = "english_os.write";
export const OAUTH_SCOPES = [OAUTH_READ_SCOPE, OAUTH_WRITE_SCOPE];

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90;
const AUTHORIZATION_CODE_TTL_SECONDS = 60 * 10;

type SignedPayload = {
  typ: string;
  iss: string;
  aud?: string;
  iat: number;
  exp: number;
  jti?: string;
  [key: string]: unknown;
};

export type McpAuthInfo = {
  ok: boolean;
  type?: "static" | "oauth";
  scopes: string[];
  subject?: string;
  email?: string;
  error?: string;
};

export type AuthorizationCodeInput = {
  request: Request;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string;
  subject: string;
  email?: string;
};

export type OAuthTokenInput = {
  request: Request;
  clientId: string;
  resource: string;
  scope: string;
  subject: string;
  email?: string;
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function getPublicBaseUrl(request?: Request) {
  const configured = process.env.ENGLISH_OS_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  if (configured) return normalizeBaseUrl(configured.startsWith("http") ? configured : `https://${configured}`);
  if (request?.url) return new URL(request.url).origin;
  return "https://english-os-dashboard.vercel.app";
}

export function getOAuthIssuer(request?: Request) {
  return getPublicBaseUrl(request);
}

export function getMcpResource(request?: Request) {
  return `${getPublicBaseUrl(request)}/api/mcp`;
}

export function getProtectedResourceMetadataUrl(request?: Request) {
  return `${getPublicBaseUrl(request)}/.well-known/oauth-protected-resource`;
}

export function getAuthorizationServerMetadataUrl(request?: Request) {
  return `${getOAuthIssuer(request)}/.well-known/oauth-authorization-server`;
}

export function getAuthorizationEndpoint(request?: Request) {
  return `${getOAuthIssuer(request)}/api/oauth/authorize`;
}

export function getTokenEndpoint(request?: Request) {
  return `${getOAuthIssuer(request)}/api/oauth/token`;
}

export function getRegistrationEndpoint(request?: Request) {
  return `${getOAuthIssuer(request)}/api/oauth/register`;
}

function getSigningSecret() {
  const secret =
    process.env.ENGLISH_OS_OAUTH_SIGNING_SECRET ||
    process.env.ENGLISH_OS_MCP_TOKEN ||
    process.env.ENGLISH_OS_TOKEN ||
    "";

  if (!secret) {
    throw new Error("Missing ENGLISH_OS_OAUTH_SIGNING_SECRET or ENGLISH_OS_MCP_TOKEN.");
  }

  return secret;
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function signPayload(payload: SignedPayload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = base64url(createHmac("sha256", getSigningSecret()).update(encoded).digest());
  return `${encoded}.${signature}`;
}

function verifySignedPayload<T extends SignedPayload>(token: string, expectedType: string): T | null {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = base64url(createHmac("sha256", getSigningSecret()).update(encoded).digest());
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(decodeBase64url(encoded)) as T;
    if (payload.typ !== expectedType) return null;
    if (!payload.exp || payload.exp < nowSeconds()) return null;
    if (payload.iat && payload.iat > nowSeconds() + 60) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseScopes(scope: string | undefined | null) {
  const parsed = String(scope || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(parsed.length ? parsed : [OAUTH_READ_SCOPE]));
}

export function scopeString(scopes: string[]) {
  return Array.from(new Set(scopes)).join(" ");
}

export function hasScopes(authInfo: McpAuthInfo, requiredScopes: string[]) {
  if (!authInfo.ok) return false;
  const available = new Set(authInfo.scopes);
  return requiredScopes.every((scope) => available.has(scope));
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get("x-english-os-mcp-token") || "";
}

export function createAuthorizationCode(input: AuthorizationCodeInput) {
  const now = nowSeconds();
  return signPayload({
    typ: "oauth_code",
    iss: getOAuthIssuer(input.request),
    aud: input.resource,
    iat: now,
    exp: now + AUTHORIZATION_CODE_TTL_SECONDS,
    jti: randomUUID(),
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    scope: input.scope,
    resource: input.resource,
    sub: input.subject,
    email: input.email || input.subject,
  });
}

export function verifyAuthorizationCode(code: string) {
  return verifySignedPayload<
    SignedPayload & {
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      code_challenge_method: string;
      scope: string;
      resource: string;
      sub: string;
      email?: string;
    }
  >(code, "oauth_code");
}

export function createAccessToken(input: OAuthTokenInput) {
  const now = nowSeconds();
  return signPayload({
    typ: "access_token",
    iss: getOAuthIssuer(input.request),
    aud: input.resource,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
    client_id: input.clientId,
    scope: input.scope,
    resource: input.resource,
    sub: input.subject,
    email: input.email || input.subject,
  });
}

export function createRefreshToken(input: OAuthTokenInput) {
  const now = nowSeconds();
  return signPayload({
    typ: "refresh_token",
    iss: getOAuthIssuer(input.request),
    aud: input.resource,
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
    client_id: input.clientId,
    scope: input.scope,
    resource: input.resource,
    sub: input.subject,
    email: input.email || input.subject,
  });
}

export function verifyRefreshToken(refreshToken: string) {
  return verifySignedPayload<
    SignedPayload & {
      client_id: string;
      scope: string;
      resource: string;
      sub: string;
      email?: string;
    }
  >(refreshToken, "refresh_token");
}

export function verifyAccessToken(request: Request, accessToken: string): McpAuthInfo {
  const payload = verifySignedPayload<
    SignedPayload & {
      scope: string;
      resource: string;
      sub: string;
      email?: string;
    }
  >(accessToken, "access_token");

  if (!payload) {
    return { ok: false, scopes: [], error: "Invalid or expired access token." };
  }

  const resource = getMcpResource(request);
  if (payload.aud !== resource && payload.resource !== resource) {
    return { ok: false, scopes: [], error: "Access token audience does not match this MCP resource." };
  }

  return {
    ok: true,
    type: "oauth",
    scopes: parseScopes(payload.scope),
    subject: payload.sub,
    email: payload.email,
  };
}

export function getRequestAuthInfo(request: Request, staticToken?: string): McpAuthInfo {
  const token = getBearerToken(request);
  if (!token) return { ok: false, scopes: [], error: "Missing bearer token." };

  if (staticToken && safeEqual(token, staticToken)) {
    return {
      ok: true,
      type: "static",
      scopes: [OAUTH_READ_SCOPE, OAUTH_WRITE_SCOPE],
      subject: "static-token-user",
    };
  }

  return verifyAccessToken(request, token);
}

export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string) {
  if (!codeVerifier || !codeChallenge) return false;
  if (method === "plain") return safeEqual(codeVerifier, codeChallenge);
  if (method !== "S256") return false;

  const digest = createHash("sha256").update(codeVerifier).digest();
  return safeEqual(base64url(digest), codeChallenge);
}

export function getWwwAuthenticateHeader(
  request: Request,
  requiredScopes: string[] = [OAUTH_READ_SCOPE],
  error = "invalid_token",
  errorDescription = "Connect English OS to continue."
) {
  const metadataUrl = getProtectedResourceMetadataUrl(request);
  const scope = scopeString(requiredScopes);
  return `Bearer resource_metadata="${metadataUrl}", scope="${scope}", error="${error}", error_description="${errorDescription}"`;
}

export function getConsentCodeConfigured() {
  return Boolean(process.env.ENGLISH_OS_OAUTH_CONSENT_CODE || process.env.ENGLISH_OS_MCP_TOKEN);
}

export function validateConsentCode(value: string) {
  const expected = process.env.ENGLISH_OS_OAUTH_CONSENT_CODE || process.env.ENGLISH_OS_MCP_TOKEN || "";
  if (!expected || !value) return false;
  return safeEqual(value, expected);
}

export function isAllowedRedirectUri(redirectUri: string) {
  return (
    redirectUri === "https://chatgpt.com/connector_platform_oauth_redirect" ||
    redirectUri.startsWith("https://chatgpt.com/connector/oauth/") ||
    redirectUri.startsWith("https://chat.openai.com/aip/g-")
  );
}

export function createClientId(clientMetadata: Record<string, unknown>, request: Request) {
  const now = nowSeconds();
  return signPayload({
    typ: "oauth_client",
    iss: getOAuthIssuer(request),
    aud: getOAuthIssuer(request),
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
    metadata: clientMetadata,
  });
}

export function verifyClientId(clientId: string) {
  return verifySignedPayload<
    SignedPayload & {
      metadata?: Record<string, unknown>;
    }
  >(clientId, "oauth_client");
}
