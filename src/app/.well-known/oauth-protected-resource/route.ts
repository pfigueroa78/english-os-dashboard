import { NextResponse } from "next/server";
import {
  OAUTH_SCOPES,
  getMcpResource,
  getOAuthIssuer,
  getPublicBaseUrl,
} from "@/lib/mcpOAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const baseUrl = getPublicBaseUrl(request);

  return NextResponse.json(
    {
      resource: getMcpResource(request),
      authorization_servers: [getOAuthIssuer(request)],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${baseUrl}/api/mcp`,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}
