import { NextResponse } from "next/server";
import {
  getOpenAIClient,
  getResponseOutputText,
  getResponseTokenUsage,
} from "@/lib/openaiSdk";
import {
  McpAuthInfo,
  OAUTH_READ_SCOPE,
  OAUTH_WRITE_SCOPE,
  getAuthorizationServerMetadataUrl,
  getMcpResource,
  getProtectedResourceMetadataUrl,
  getRequestAuthInfo,
  getWwwAuthenticateHeader,
  hasScopes,
} from "@/lib/mcpOAuth";
import { canWriteClassApproval } from "@/modules/coach-approval/application";

export const runtime = "nodejs";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;
const ENGLISH_OS_MCP_TOKEN = process.env.ENGLISH_OS_MCP_TOKEN || ENGLISH_OS_TOKEN;
const OPENAI_ANALYSIS_MODEL =
  process.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS || 1600
);

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "english-os-mcp";
const SERVER_VERSION = "0.2.0";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: any;
};

type OAuth2SecurityScheme = {
  type: "oauth2";
  scopes: string[];
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  securitySchemes: OAuth2SecurityScheme[];
  _meta: {
    securitySchemes: OAuth2SecurityScheme[];
  };
};

class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const READ_SECURITY: OAuth2SecurityScheme[] = [{ type: "oauth2", scopes: [OAUTH_READ_SCOPE] }];
const WRITE_SECURITY: OAuth2SecurityScheme[] = [
  { type: "oauth2", scopes: [OAUTH_READ_SCOPE, OAUTH_WRITE_SCOPE] },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ENGLISH_OS_MCP_ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization,content-type,mcp-session-id,x-english-os-mcp-token",
    "Access-Control-Expose-Headers": "mcp-session-id,www-authenticate",
  };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(data, {
    status,
    headers: {
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function unauthorized(request: Request, requiredScopes = [OAUTH_READ_SCOPE]) {
  return json(
    {
      ok: false,
      error: "Unauthorized MCP request. Connect English OS with OAuth or provide a valid bearer token.",
    },
    401,
    {
      "WWW-Authenticate": getWwwAuthenticateHeader(request, requiredScopes),
    }
  );
}

function result(id: JsonRpcRequest["id"], value: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result: value,
  };
}

function error(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  };
}

function authRequiredResult(id: JsonRpcRequest["id"], request: Request, requiredScopes: string[]) {
  const challenge = getWwwAuthenticateHeader(
    request,
    requiredScopes,
    "insufficient_scope",
    "Connect English OS to continue."
  );

  return result(id, {
    content: [
      {
        type: "text",
        text: "Authentication required: connect English OS with OAuth to continue.",
      },
    ],
    _meta: {
      "mcp/www_authenticate": [challenge],
    },
    isError: true,
  });
}

function textToolResult(text: string, structuredContent?: unknown) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function requiredString(args: any, key: string) {
  const value = String(args?.[key] || "").trim();
  if (!value) throw new ToolError(`Missing required argument: ${key}`);
  return value;
}

function optionalString(args: any, key: string) {
  return String(args?.[key] || "").trim();
}

function optionalNumber(args: any, key: string) {
  const value = Number(args?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveGlobalClass(unit: number, args: any) {
  const explicitGlobal = optionalNumber(args, "globalClass") || optionalNumber(args, "classNumber");
  if (explicitGlobal) return explicitGlobal;

  const localClass = optionalNumber(args, "localClass");
  if (!unit || !localClass) return 0;

  return (unit - 1) * 7 + localClass;
}

async function callEnglishOSAction(action: string, params: Record<string, string>) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) {
    throw new ToolError("Missing ENGLISH_OS_BASE_URL or ENGLISH_OS_TOKEN.");
  }

  const url = new URL(ENGLISH_OS_BASE_URL);
  url.searchParams.set("token", ENGLISH_OS_TOKEN);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok || data?.ok === false) {
    throw new ToolError(data?.error || `English OS action failed: ${action}`);
  }

  return data;
}

async function analyzeTranscript(args: any) {
  const transcript = requiredString(args, "transcript");
  const focus = optionalString(args, "focus") || "Analiza calidad pedagógica, progreso, riesgos y próximos pasos.";
  const userEmail = optionalString(args, "userEmail");
  const previousResponseId = optionalString(args, "previousResponseId");
  const learnerContext = userEmail
    ? await callEnglishOSAction("getLearnerContext", { userEmail, learnerId: userEmail })
    : null;

  const openai = getOpenAIClient();
  const response = await openai.responses.create({
    model: OPENAI_ANALYSIS_MODEL,
    previous_response_id: previousResponseId || undefined,
    input: [
      {
        role: "developer",
        content:
          "You are an English OS MCP analyst. Analyze the supplied learning transcript in Spanish. Return Markdown with: Diagnóstico ejecutivo, Evidencia, Riesgos, Mejoras pedagógicas, Mejoras UI/frontend, Próximos pasos.",
      },
      {
        role: "user",
        content: [
          "Analysis focus:",
          focus,
          "",
          "Optional English OS context:",
          learnerContext ? pretty(learnerContext).slice(0, 4500) : "No user context supplied.",
          "",
          "Transcript:",
          transcript.slice(0, 18000),
        ].join("\n"),
      },
    ],
    max_output_tokens: OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS,
  } as any);

  const reply = getResponseOutputText(response) || "No analysis returned.";
  const usage = getResponseTokenUsage(response);

  return {
    reply,
    responseId: response.id || "",
    usage,
  };
}

function withSecurity(tool: Omit<ToolDefinition, "securitySchemes" | "_meta">, securitySchemes: OAuth2SecurityScheme[]) {
  return {
    ...tool,
    securitySchemes,
    _meta: {
      securitySchemes,
    },
  };
}

const MCP_TOOLS: ToolDefinition[] = [
  withSecurity(
    {
      name: "english_os_get_learner_context",
      description: "Read-only. Get English OS learner context for a specific learner email.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: { type: "string", description: "Learner email address." },
        },
        required: ["userEmail"],
        additionalProperties: false,
      },
    },
    READ_SECURITY
  ),
  withSecurity(
    {
      name: "english_os_get_current_class",
      description: "Read-only. Get the learner's current English OS class, learning state, and class content.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: { type: "string", description: "Learner email address." },
          learnerId: { type: "string", description: "Optional learner ID. Defaults to userEmail." },
        },
        required: ["userEmail"],
        additionalProperties: false,
      },
    },
    READ_SECURITY
  ),
  withSecurity(
    {
      name: "english_os_get_class_content",
      description: "Read-only. Get content for a specific English OS class by unit and local or global class number.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: { type: "string", description: "Learner email address." },
          unit: { type: "number", description: "Unit number, 1-12." },
          localClass: { type: "number", description: "Local class inside unit, 1-7." },
          globalClass: { type: "number", description: "Global English OS class number. Optional if localClass is supplied." },
        },
        required: ["userEmail", "unit"],
        additionalProperties: false,
      },
    },
    READ_SECURITY
  ),
  withSecurity(
    {
      name: "passages_run_diagnostic",
      description: "Read-only. Run the production Passages vector-store diagnostic for a unit and local class.",
      inputSchema: {
        type: "object",
        properties: {
          unit: { type: "number", description: "Unit number, 1-12." },
          localClass: { type: "number", description: "Local class inside unit, 1-7." },
        },
        required: ["unit", "localClass"],
        additionalProperties: false,
      },
    },
    READ_SECURITY
  ),
  withSecurity(
    {
      name: "conversation_analyze",
      description: "Read-only. Analyze a supplied transcript using OpenAI and optional English OS learner context.",
      inputSchema: {
        type: "object",
        properties: {
          transcript: { type: "string", description: "Conversation transcript to analyze." },
          focus: { type: "string", description: "Optional analysis focus." },
          userEmail: { type: "string", description: "Optional learner email for English OS context." },
          previousResponseId: { type: "string", description: "Optional OpenAI response ID to continue analysis." },
        },
        required: ["transcript"],
        additionalProperties: false,
      },
    },
    READ_SECURITY
  ),
  withSecurity(
    {
      name: "english_os_approve_current_class_practice",
      description:
        "Write action. Approve current class practice only when confirm is true and a class-specific approval evaluation proves the learner met the rubric.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: { type: "string", description: "Learner email address." },
          confirm: { type: "boolean", description: "Must be true to perform this write action." },
          evaluation: {
            type: "object",
            description:
              "Evidence-based class approval evaluation. Must include canApproveClass=true, completed gates, no blocking errors, and approval evidence.",
          },
        },
        required: ["userEmail", "confirm", "evaluation"],
        additionalProperties: false,
      },
    },
    WRITE_SECURITY
  ),
  withSecurity(
    {
      name: "english_os_advance_to_next_class",
      description: "Write action. Advance to the next class only when confirm is true.",
      inputSchema: {
        type: "object",
        properties: {
          userEmail: { type: "string", description: "Learner email address." },
          confirm: { type: "boolean", description: "Must be true to perform this write action." },
        },
        required: ["userEmail", "confirm"],
        additionalProperties: false,
      },
    },
    WRITE_SECURITY
  ),
];

function requiredScopesForTool(name: string) {
  if (["english_os_approve_current_class_practice", "english_os_advance_to_next_class"].includes(name)) {
    return [OAUTH_READ_SCOPE, OAUTH_WRITE_SCOPE];
  }
  return [OAUTH_READ_SCOPE];
}

async function callTool(name: string, args: any, request: Request) {
  if (name === "english_os_get_learner_context") {
    const userEmail = requiredString(args, "userEmail");
    const data = await callEnglishOSAction("getLearnerContext", { userEmail, learnerId: userEmail });
    return textToolResult(pretty(data), data);
  }

  if (name === "english_os_get_current_class") {
    const userEmail = requiredString(args, "userEmail");
    const learnerId = optionalString(args, "learnerId") || userEmail;
    const data = await callEnglishOSAction("getCurrentClassContent", { userEmail, learnerId });
    return textToolResult(pretty(data), data);
  }

  if (name === "english_os_get_class_content") {
    const userEmail = requiredString(args, "userEmail");
    const unit = optionalNumber(args, "unit");
    const classNumber = resolveGlobalClass(unit, args);
    if (!unit) throw new ToolError("Missing required argument: unit");
    if (!classNumber) throw new ToolError("Provide localClass or globalClass.");

    const data = await callEnglishOSAction("getClassContent", {
      userEmail,
      learnerId: userEmail,
      unit: String(unit),
      classNumber: String(classNumber),
    });
    return textToolResult(pretty(data), data);
  }

  if (name === "passages_run_diagnostic") {
    const unit = optionalNumber(args, "unit");
    const localClass = optionalNumber(args, "localClass");
    if (!unit) throw new ToolError("Missing required argument: unit");
    if (!localClass) throw new ToolError("Missing required argument: localClass");

    const url = new URL("/api/english-os/debug/passages", request.url);
    url.searchParams.set("unit", String(unit));
    url.searchParams.set("class", String(localClass));

    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new ToolError(data?.error || "Passages diagnostic failed.");
    return textToolResult(pretty(data), data);
  }

  if (name === "conversation_analyze") {
    const data = await analyzeTranscript(args);
    return textToolResult(data.reply, data);
  }

  if (name === "english_os_approve_current_class_practice") {
    const userEmail = requiredString(args, "userEmail");
    if (args?.confirm !== true) {
      throw new ToolError("Confirmation required: set confirm=true to approve current class practice.");
    }
    if (!canWriteClassApproval(args?.evaluation)) {
      throw new ToolError(
        "Class approval blocked: provide an evidence-based evaluation with canApproveClass=true, completed gates, approval evidence, and no blocking errors."
      );
    }
    const data = await callEnglishOSAction("approveCurrentClassExercises", {
      userEmail,
      learnerId: userEmail,
      classId: args.evaluation.classId,
      approvalEvidence: args.evaluation.approvalEvidence,
      rubric: args.evaluation.rubric,
    });
    return textToolResult(pretty(data), data);
  }

  if (name === "english_os_advance_to_next_class") {
    const userEmail = requiredString(args, "userEmail");
    if (args?.confirm !== true) {
      throw new ToolError("Confirmation required: set confirm=true to advance to the next class.");
    }
    const data = await callEnglishOSAction("advanceToNextClass", {
      userEmail,
      learnerId: userEmail,
    });
    return textToolResult(pretty(data), data);
  }

  throw new ToolError(`Unknown tool: ${name}`);
}

async function handleJsonRpc(payload: JsonRpcRequest, request: Request, authInfo: McpAuthInfo) {
  const id = payload?.id ?? null;
  const method = payload?.method || "";

  if (!method) return error(id, -32600, "Invalid JSON-RPC request: missing method.");

  if (method.startsWith("notifications/")) {
    return null;
  }

  try {
    if (method === "initialize") {
      return result(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
        instructions:
          "English OS MCP exposes controlled tools for learner context, current class, class content, Passages diagnostics, transcript analysis, and confirmed class advancement actions.",
      });
    }

    if (method === "ping") return result(id, {});

    if (method === "tools/list") {
      return result(id, { tools: MCP_TOOLS });
    }

    if (method === "resources/list") {
      return result(id, { resources: [] });
    }

    if (method === "prompts/list") {
      return result(id, { prompts: [] });
    }

    if (method === "tools/call") {
      const name = String(payload.params?.name || "");
      const args = payload.params?.arguments || {};
      if (!name) return error(id, -32602, "Missing tool name.");

      const requiredScopes = requiredScopesForTool(name);
      if (!hasScopes(authInfo, requiredScopes)) {
        return authRequiredResult(id, request, requiredScopes);
      }

      const toolResult = await callTool(name, args, request);
      return result(id, toolResult);
    }

    return error(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown MCP error";
    return error(id, err instanceof ToolError ? -32000 : -32603, message);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function GET(request: Request) {
  const authInfo = getRequestAuthInfo(request, ENGLISH_OS_MCP_TOKEN);

  return json({
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    endpoint: new URL("/api/mcp", request.url).toString(),
    resource: getMcpResource(request),
    protectedResourceMetadata: getProtectedResourceMetadataUrl(request),
    authorizationServerMetadata: getAuthorizationServerMetadataUrl(request),
    auth: authInfo.ok ? authInfo.type : "oauth2 required for tools/call",
    tools: MCP_TOOLS.map((tool) => tool.name),
  });
}

export async function POST(request: Request) {
  let body: JsonRpcRequest | JsonRpcRequest[];

  try {
    body = await request.json();
  } catch {
    return json(error(null, -32700, "Parse error."), 400);
  }

  const authInfo = getRequestAuthInfo(request, ENGLISH_OS_MCP_TOKEN);

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((item) => handleJsonRpc(item, request, authInfo)))).filter(Boolean);
    if (!responses.length) {
      return new Response(null, { status: 202, headers: corsHeaders() });
    }
    return json(responses);
  }

  const response = await handleJsonRpc(body, request, authInfo);
  if (!response) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }

  return json(response);
}
