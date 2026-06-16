import { NextResponse } from "next/server";
import {
  OAUTH_SCOPES,
  getAuthorizationEndpoint,
  getOAuthIssuer,
  getRegistrationEndpoint,
  getTokenEndpoint,
} from "@/lib/mcpOAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(
    {
      issuer: getOAuthIssuer(request),
      authorization_endpoint: getAuthorizationEndpoint(request),
      token_endpoint: getTokenEndpoint(request),
      registration_endpoint: getRegistrationEndpoint(request),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: OAUTH_SCOPES,
      resource_parameter_supported: true,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}
