import { NextResponse } from "next/server";
import {
  createAccessToken,
  createRefreshToken,
  verifyAuthorizationCode,
  verifyPkce,
  verifyRefreshToken,
} from "@/lib/mcpOAuth";

export const runtime = "nodejs";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Cache-Control": "no-store",
  };
}

async function readParams(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value));
    });
    return params;
  }
  return new URLSearchParams(await request.text());
}

function oauthError(code: string, description: string, status = 400) {
  return NextResponse.json({ error: code, error_description: description }, { status, headers: corsHeaders() });
}

function issueTokens(input: {
  request: Request;
  clientId: string;
  resource: string;
  scope: string;
  subject: string;
  email?: string;
}) {
  return NextResponse.json(
    {
      access_token: createAccessToken(input),
      refresh_token: createRefreshToken(input),
      token_type: "Bearer",
      expires_in: 60 * 60 * 24 * 30,
      scope: input.scope,
    },
    { headers: corsHeaders() }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const params = await readParams(request);
  const grantType = params.get("grant_type") || "";
  const clientId = params.get("client_id") || "";

  if (grantType === "authorization_code") {
    const codePayload = verifyAuthorizationCode(params.get("code") || "");
    if (!codePayload) return oauthError("invalid_grant", "Invalid or expired authorization code.");
    if (!clientId || clientId !== codePayload.client_id) return oauthError("invalid_client", "client_id does not match the authorization code.");
    if ((params.get("redirect_uri") || "") !== codePayload.redirect_uri) return oauthError("invalid_grant", "redirect_uri does not match the authorization code.");
    if (!verifyPkce(params.get("code_verifier") || "", codePayload.code_challenge, codePayload.code_challenge_method)) return oauthError("invalid_grant", "Invalid PKCE code_verifier.");
    if ((params.get("resource") || codePayload.resource) !== codePayload.resource) return oauthError("invalid_target", "resource does not match the authorization code.");

    return issueTokens({
      request,
      clientId,
      resource: codePayload.resource,
      scope: codePayload.scope,
      subject: codePayload.sub,
      email: codePayload.email,
    });
  }

  if (grantType === "refresh_token") {
    const payload = verifyRefreshToken(params.get("refresh_token") || "");
    if (!payload) return oauthError("invalid_grant", "Invalid or expired refresh token.");
    if (clientId && clientId !== payload.client_id) return oauthError("invalid_client", "client_id does not match the refresh token.");
    if ((params.get("resource") || payload.resource) !== payload.resource) return oauthError("invalid_target", "resource does not match the refresh token.");

    return issueTokens({
      request,
      clientId: payload.client_id,
      resource: payload.resource,
      scope: payload.scope,
      subject: payload.sub,
      email: payload.email,
    });
  }

  return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
}
