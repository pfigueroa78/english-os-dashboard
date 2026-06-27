import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  buildClassApprovalRubric,
  canWriteClassApproval,
  evaluateClassApproval,
  type ClassApprovalEvaluation,
} from "@/modules/coach-approval/application";

export const runtime = "nodejs";

const MCP_TOKEN = process.env.ENGLISH_OS_MCP_TOKEN || process.env.ENGLISH_OS_TOKEN || "";

type JsonRpcToolResult = {
  content?: { type: string; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
};

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  result?: JsonRpcToolResult;
  error?: { code?: number; message?: string; data?: unknown };
};

function learnerNameFromEmail(email: string) {
  const local = email.split("@")[0] || "learner";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function baseV02Payload(params: {
  userEmail: string;
  rawContext?: unknown;
  rawCurrentClass?: unknown;
}) {
  const rubric = buildClassApprovalRubric(params.rawCurrentClass || params.rawContext);

  return {
    version: "English OS v0.2 — Adaptive Learning UX",
    learner: {
      name: learnerNameFromEmail(params.userEmail),
      email: params.userEmail,
      learnerId: params.userEmail,
    },
    mission: {
      todayFocus: "Guided class practice with evidence-based approval.",
      mode: "adaptive_class",
      mainTarget: "Complete the active class steps, submit the evaluation gate, and approve only with evidence.",
      nextRecommendedAction:
        "Continue the active class, collect learner evidence, evaluate it with the active class rubric, and only then approve.",
    },
    currentClass: {
      classId: rubric.classId,
      lessonType: rubric.lessonType,
      requirementsToPass: [
        "Complete the evaluation gate.",
        "Complete the required active class sections.",
        "Meet the grammar or key-language target for the active class.",
        "Use class-relevant vocabulary or chunks.",
        "Produce enough language to satisfy the communicative task.",
        "Resolve blocking grammar errors before approval.",
      ],
      guardrail: "Opening content or practice alone does not approve the class. Approval requires evaluated evidence.",
      rubric,
    },
    rawContext: params.rawContext || null,
    rawCurrentClass: params.rawCurrentClass || null,
  };
}

async function callMcpTool(request: Request, name: string, args: Record<string, unknown>) {
  if (!MCP_TOKEN) {
    throw new Error("Missing ENGLISH_OS_MCP_TOKEN or ENGLISH_OS_TOKEN.");
  }

  const mcpUrl = new URL("/api/mcp", request.url);
  const response = await fetch(mcpUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MCP_TOKEN}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${name}-${Date.now()}`,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }),
  });

  const rpc = (await response.json()) as JsonRpcResponse;
  if (!response.ok || rpc.error) {
    throw new Error(rpc.error?.message || `MCP tool failed: ${name}`);
  }

  if (rpc.result?.structuredContent) return rpc.result.structuredContent;

  const text = rpc.result?.content?.[0]?.text || "";
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function getAuthenticatedEmail(bodyEmail?: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authentication required.");
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress || "";
  if (!email) {
    throw new Error("No email found for current user.");
  }

  return bodyEmail && bodyEmail === email ? bodyEmail : email;
}

function selfTest() {
  const unit5Class1 = {
    unit: 5,
    localClass: 1,
    lessonType: "Starting point + Reading + Vocabulary & Speaking",
    contract: "Active class target structures: It's polite to ask follow-up questions; gerund phrases; infinitive phrases; make conversation; describe polite and rude behavior",
  };
  const unit2Class1 = {
    unit: 2,
    localClass: 1,
    lessonType: "Starting point + Listening + Grammar + Discussion",
    contract: "Active class target structures: should have + past participle; was supposed to + base verb; didn't have to + base verb; talk about past mistakes",
  };

  const unit5Rubric = buildClassApprovalRubric(unit5Class1);
  const unit2Rubric = buildClassApprovalRubric(unit2Class1);
  const acceptable = evaluateClassApproval({
    answer: "It is polite to ask follow-up questions when you meet someone new. Ignoring your partner is rude because it stops the conversation.",
    classPack: unit5Class1,
  });
  const blocking = evaluateClassApproval({
    answer: "I should to studied more.",
    classPack: unit2Class1,
  });

  const tests = [
    {
      id: "dynamic-rubric-unit-5",
      passed: unit5Rubric.classId === "unit-05-class-01" && unit5Rubric.expectedProduction.length > 0,
      result: "Rubric can be created from non-business class content.",
    },
    {
      id: "dynamic-rubric-unit-2",
      passed: unit2Rubric.classId === "unit-02-class-01" && unit2Rubric.grammarTargets.length > 0,
      result: "Rubric can be created from grammar-focused class content.",
    },
    {
      id: "approval-evidence-required",
      passed: acceptable.canApproveClass && canWriteClassApproval(acceptable),
      result: "A class can be approved only after evaluated evidence satisfies the rubric.",
    },
    {
      id: "blocking-error-prevents-approval",
      passed: !blocking.canApproveClass && blocking.blockingErrors.length > 0 && !canWriteClassApproval(blocking),
      result: "Blocking grammar errors prevent approval.",
    },
  ];

  return {
    ok: tests.every((test) => test.passed),
    version: "English OS v0.2 — Adaptive Learning UX",
    tests,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("selfTest") === "1") {
    return NextResponse.json(selfTest(), { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    ok: true,
    version: "English OS v0.2 — Adaptive Learning UX",
    endpoint: "/api/english-os/v02",
    actions: ["bootstrap", "analyze_practice", "approve_practice", "selfTest"],
    approvalRule: "Approval requires evaluated class evidence; confirm=true alone is not enough.",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      userEmail?: string;
      learnerId?: string;
      answer?: string;
      focus?: string;
      transcript?: string;
      confirm?: boolean;
      classPack?: unknown;
      currentClass?: unknown;
      evaluation?: ClassApprovalEvaluation;
      evaluationGateCompleted?: boolean;
      activeSectionsCompleted?: boolean;
    };

    const action = body.action || "bootstrap";
    const userEmail = await getAuthenticatedEmail(body.userEmail);

    if (action === "bootstrap") {
      let rawContext: unknown = null;
      let rawCurrentClass: unknown = null;
      const warnings: string[] = [];

      try {
        rawContext = await callMcpTool(request, "english_os_get_learner_context", { userEmail });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Could not load learner context.");
      }

      try {
        rawCurrentClass = await callMcpTool(request, "english_os_get_current_class", {
          userEmail,
          learnerId: body.learnerId || userEmail,
        });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Could not load current class.");
      }

      return NextResponse.json({
        ok: true,
        ...baseV02Payload({ userEmail, rawContext, rawCurrentClass }),
        warnings,
      });
    }

    if (action === "analyze_practice") {
      const answer = String(body.answer || body.transcript || "").trim();
      if (!answer) {
        return NextResponse.json({ ok: false, error: "Missing practice answer." }, { status: 400 });
      }

      const classPack = body.classPack || body.currentClass || null;
      const evaluation = evaluateClassApproval({
        answer,
        classPack,
        evaluationGateCompleted: body.evaluationGateCompleted,
        activeSectionsCompleted: body.activeSectionsCompleted,
      });
      let mcpAnalysis: unknown = null;
      let mcpAnalysisError = "";

      try {
        mcpAnalysis = await callMcpTool(request, "conversation_analyze", {
          userEmail,
          transcript: `Learner practice answer:\n${answer}`,
          focus:
            body.focus ||
            "Evaluate the learner answer against the active class rubric. Do not approve without evidence.",
        });
      } catch (error) {
        mcpAnalysisError = error instanceof Error ? error.message : "MCP analysis failed.";
      }

      return NextResponse.json({
        ok: true,
        answer,
        evaluation,
        mcpAnalysis,
        mcpAnalysisError,
        automaticSessionSummary: {
          improved: evaluation.approvalEvidence,
          stillNeedsWork: evaluation.blockingErrors,
          nextAction: evaluation.canApproveClass
            ? "Approve the class only after the approval write succeeds."
            : evaluation.retryPrompt,
        },
        autoAdvance: false,
        advanceRule: "Opening or practicing content does not advance the learner automatically.",
      });
    }

    if (action === "approve_practice") {
      if (body.confirm !== true) {
        return NextResponse.json(
          {
            ok: false,
            error: "Explicit confirmation required. This action approves practice but does not advance the class automatically.",
          },
          { status: 400 }
        );
      }

      if (!canWriteClassApproval(body.evaluation)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Class approval requires evaluated evidence with canApproveClass=true and no blocking errors.",
            approvalRequiredShape: {
              evaluationGateCompleted: true,
              activeSectionsCompleted: true,
              canApproveClass: true,
              blockingErrors: [],
              approvalEvidence: ["..."],
            },
          },
          { status: 409 }
        );
      }

      const result = await callMcpTool(request, "english_os_approve_current_class_practice", {
        userEmail,
        confirm: true,
        evaluation: body.evaluation,
      });

      return NextResponse.json({
        ok: true,
        approved: true,
        advanced: false,
        closingMessage: "Class approved. You can now advance to the next class.",
        approvalEvidence: body.evaluation.approvalEvidence,
        result,
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("Authentication required") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
