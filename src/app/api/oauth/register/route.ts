import { NextResponse } from "next/server";
import {
  OAUTH_SCOPES,
  createClientId,
  scopeString,
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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const metadata = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = createClientId(metadata, request);

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: scopeString(OAUTH_SCOPES),
      redirect_uris: Array.isArray(metadata.redirect_uris) ? metadata.redirect_uris : [],
      client_name: metadata.client_name || "ChatGPT English OS connector",
    },
    { status: 201, headers: corsHeaders() }
  );
}
