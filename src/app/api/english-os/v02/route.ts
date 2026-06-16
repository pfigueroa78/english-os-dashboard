import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MCP_TOKEN = process.env.ENGLISH_OS_MCP_TOKEN || process.env.ENGLISH_OS_TOKEN || "";
const TEST_LEARNER_EMAIL = "pfigueroamiranda@gmail.com";

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

type PracticeEvaluation = {
  grammar: "approved" | "needs_work";
  vocabulary: "approved" | "needs_work";
  businessReasoning: "approved" | "needs_work";
  eligibleForApproval: boolean;
  detectedIssue: string;
  quickCorrection: string;
  detailedExplanation: string;
  retryPrompt: string;
  suggestedAnswer: string;
  sessionSummary: {
    improved: string[];
    stillNeedsWork: string[];
    nextAction: string;
  };
};

const ACTIVE_VOCABULARY = [
  "keeping the project aligned with business priorities",
  "strategic reasoning",
  "so everyone knows what to prioritize",
  "professionally appropriate",
  "focus on improving communication first",
  "Although Bogotá has many job opportunities",
  "Despite Bogotá’s many job opportunities",
  "The way I see it, you ought to...",
];

const PRIORITY_MISTAKES = [
  {
    id: "although-vs-despite",
    mistake: "Despite Bogotá has many job opportunities, I prefer Cali.",
    correction: "Although Bogotá has many job opportunities, I prefer Cali.",
    rule: "Use although + subject + verb. Use despite + noun phrase.",
    examples: [
      "Although the deadline is important, the team needs a clearer plan.",
      "Despite Bogotá’s many job opportunities, I prefer Cali.",
    ],
    retryPrompt: "Rewrite the sentence using although, then rewrite it again using despite + noun phrase.",
  },
  {
    id: "ought-to-base-verb",
    mistake: "You ought to giving the team some time off.",
    correction: "You ought to give the team some time off.",
    rule: "Use ought to + base verb.",
    examples: [
      "You ought to restart the project with a clearer plan.",
      "The manager ought to focus on improving communication first.",
    ],
    retryPrompt: "Give business advice using: The way I see it, you ought to...",
  },
  {
    id: "strategic-consequence",
    mistake: "The advice is correct, but it stops before explaining the business outcome.",
    correction: "Add a final outcome sentence: This would help the team recover while keeping the project aligned with business priorities.",
    rule: "B2 business advice should include advice + contrast + strategic consequence.",
    examples: [
      "This would help everyone recover while keeping the project aligned with business priorities.",
      "This would improve communication while helping the team prioritize the most urgent tasks.",
    ],
    retryPrompt: "Add one final sentence beginning with: This would help...",
  },
  {
    id: "natural-time-off",
    mistake: "give vacations to whole the team",
    correction: "give the whole team some time off",
    rule: "Use natural business English: give + the whole team + some time off.",
    examples: [
      "You ought to give the whole team some time off.",
      "It might not be a bad idea to give the team a short break.",
    ],
    retryPrompt: "Say the idea naturally using: give the whole team some time off.",
  },
  {
    id: "focus-on-gerund",
    mistake: "The manager should focus on improve communication.",
    correction: "The manager should focus on improving communication.",
    rule: "After focus on, use a noun or gerund.",
    examples: [
      "The manager should focus on improving communication first.",
      "The team should focus on prioritizing the most urgent work.",
    ],
    retryPrompt: "Use focus on + gerund in one business advice sentence.",
  },
];

function baseV02Payload(rawContext: unknown = null, rawCurrentClass: unknown = null) {
  return {
    version: "English OS v0.2 — Adaptive Learning UX",
    learner: {
      name: "Pedro",
      email: TEST_LEARNER_EMAIL,
      learnerId: TEST_LEARNER_EMAIL,
      registeredLevel: "B1+",
      recentEvidenceLevel: "B2-",
    },
    mission: {
      todayFocus: "Business advice with contrast and strategic consequence.",
      currentPosition: "Unit 4 — Class 28",
      mode: "Reviewing",
      level: "B1+ registered / B2- recent evidence",
      mainTarget: "Add a final outcome sentence after giving advice.",
      whyThisMatters:
        "This moves advice from a correct B1 sentence to a B2 business response with contrast, prioritization, and strategic consequence.",
      nextRecommendedAction:
        "Continue the current review class, complete one business-advice practice, retry one recurring mistake, then review the automatic session summary.",
    },
    currentClass: {
      unit: 4,
      localClass: 7,
      globalClass: 28,
      label: "Unit 4 — Class 28",
      title: "Video Class / Integrated Review",
      lesson: "Business advice speaking practice: expanding advice with contrast",
      status: "not_started",
      mode: "reviewing",
      goal: "Give advice to a tired project team using advice, contrast, and a final strategic consequence.",
      keyLanguage: [
        "The way I see it, you ought to...",
        "Although the deadline is important, ...",
        "It might not be a bad idea to...",
        "This would help...",
        "so everyone knows what to prioritize",
        "keeping the project aligned with business priorities",
      ],
      resources: [
        "Current class content from English OS",
        "Business advice speaking prompt",
        "Recurring mistake drills",
        "Automatic session summary",
      ],
      requirementsToPass: [
        "Use one advice structure.",
        "Use one contrast structure with although or despite + noun phrase.",
        "Add one final strategic consequence sentence.",
        "Retry at least one recurring mistake.",
        "Receive Grammar, Vocabulary, and Business reasoning approval.",
      ],
      guardrail: "Opening content does not complete the class. No automatic advancement is allowed.",
    },
    mistakes: PRIORITY_MISTAKES,
    activeVocabulary: ACTIVE_VOCABULARY,
    rawContext,
    rawCurrentClass,
  };
}

function normalizeAnswer(answer: string) {
  return answer.trim().replace(/\s+/g, " ");
}

function evaluatePractice(answer: string): PracticeEvaluation {
  const normalized = normalizeAnswer(answer);
  const lower = normalized.toLowerCase();

  const suggestedAnswer =
    "The way I see it, you ought to give the whole team some time off. Although the deadline is important, it might not be a bad idea to restart the project with a clearer plan so everyone knows what to prioritize. This would help the team recover while keeping the project aligned with business priorities.";

  const sessionSummary = {
    improved: ["business advice", "contrast with although", "consequence language"],
    stillNeedsWork: ["despite + noun phrase", "longer spoken answers"],
    nextAction: "Repeat this structure in a business scenario.",
  };

  if (/despite\s+bogot[aá]\s+has/i.test(normalized) || /despite\s+[^,.]+\s+has\s+/i.test(normalized)) {
    return {
      grammar: "needs_work",
      vocabulary: "needs_work",
      businessReasoning: "needs_work",
      eligibleForApproval: false,
      detectedIssue: "Although vs despite",
      quickCorrection: "Although Bogotá has many job opportunities, I prefer Cali.",
      detailedExplanation:
        "Use although + subject + verb: Although Bogotá has many job opportunities. Use despite + noun phrase: Despite Bogotá’s many job opportunities.",
      retryPrompt:
        "Try again with: Although Bogotá has many job opportunities, I prefer Cali. Then create a second version with: Despite Bogotá’s many job opportunities, I prefer Cali.",
      suggestedAnswer: "Although Bogotá has many job opportunities, I prefer Cali.",
      sessionSummary: {
        improved: ["contrast awareness"],
        stillNeedsWork: ["although + subject + verb", "despite + noun phrase"],
        nextAction: "Retry the same idea once with although and once with despite.",
      },
    };
  }

  if (lower.includes("ought to giving") || lower.includes("ought to improving")) {
    return {
      grammar: "needs_work",
      vocabulary: "needs_work",
      businessReasoning: "needs_work",
      eligibleForApproval: false,
      detectedIssue: "Ought to + base verb",
      quickCorrection: normalized.replace(/ought to giving/gi, "ought to give").replace(/ought to improving/gi, "ought to improve"),
      detailedExplanation:
        "After ought to, use the base verb. Say: you ought to give, you ought to improve, you ought to restart.",
      retryPrompt: "Give the advice again using: The way I see it, you ought to give...",
      suggestedAnswer,
      sessionSummary,
    };
  }

  if (lower.includes("give vacations to whole the team")) {
    return {
      grammar: "needs_work",
      vocabulary: "needs_work",
      businessReasoning: "needs_work",
      eligibleForApproval: false,
      detectedIssue: "Natural business phrasing",
      quickCorrection: "The way I see it, you ought to give the whole team some time off.",
      detailedExplanation:
        "In business English, give the whole team some time off is more natural than give vacations to whole the team.",
      retryPrompt: "Retry using: give the whole team some time off.",
      suggestedAnswer,
      sessionSummary,
    };
  }

  if (lower.includes("focus on improve")) {
    return {
      grammar: "needs_work",
      vocabulary: "needs_work",
      businessReasoning: "needs_work",
      eligibleForApproval: false,
      detectedIssue: "focus on + gerund",
      quickCorrection: "The manager should focus on improving communication first.",
      detailedExplanation:
        "After focus on, use a noun or gerund. Use improving, prioritizing, communicating, not improve.",
      retryPrompt: "Retry with: The manager should focus on improving...",
      suggestedAnswer,
      sessionSummary,
    };
  }

  const hasAdvice = /the way i see it,\s*you ought to give the whole team some time off/i.test(normalized);
  const hasAlthough = /\balthough\b/i.test(normalized);
  const hasBadIdea = /it might not be a bad idea to/i.test(normalized);
  const hasPrioritize = /so everyone knows what to prioritize/i.test(normalized);
  const hasConsequence = /this would help/i.test(normalized);
  const hasBusinessPriorities = /business priorities/i.test(normalized);

  if (hasAdvice && !(hasAlthough && hasBadIdea && hasPrioritize && hasConsequence && hasBusinessPriorities)) {
    return {
      grammar: "approved",
      vocabulary: hasBusinessPriorities || hasPrioritize ? "approved" : "needs_work",
      businessReasoning: "needs_work",
      eligibleForApproval: false,
      detectedIssue: "Business advice without final strategic consequence",
      quickCorrection:
        "Your advice sentence is correct, but add a strategic outcome: This would help the team recover while keeping the project aligned with business priorities.",
      detailedExplanation:
        "At B2, business advice should not stop after the recommendation. Add contrast and explain the outcome for the team or business.",
      retryPrompt:
        "Expand your answer with although, it might not be a bad idea to, and a final sentence starting with This would help...",
      suggestedAnswer,
      sessionSummary: {
        improved: ["ought to + base verb", "natural time-off expression"],
        stillNeedsWork: ["contrast", "strategic consequence"],
        nextAction: "Add a final business outcome sentence to the same advice.",
      },
    };
  }

  if (hasAdvice && hasAlthough && hasBadIdea && hasPrioritize && hasConsequence && hasBusinessPriorities) {
    return {
      grammar: "approved",
      vocabulary: "approved",
      businessReasoning: "approved",
      eligibleForApproval: true,
      detectedIssue: "No blocking issue detected",
      quickCorrection: "Approved. This is a B2-ready business advice response.",
      detailedExplanation:
        "You gave advice, added contrast, suggested a practical restart action, explained prioritization, and ended with a strategic business consequence.",
      retryPrompt: "Now say the same answer aloud with natural pauses and connected speech.",
      suggestedAnswer,
      sessionSummary,
    };
  }

  return {
    grammar: lower.length > 20 ? "approved" : "needs_work",
    vocabulary: lower.includes("business") || lower.includes("prioritize") ? "approved" : "needs_work",
    businessReasoning: hasConsequence ? "approved" : "needs_work",
    eligibleForApproval: false,
    detectedIssue: "Needs fuller B2 business structure",
    quickCorrection:
      "Build the answer with: advice + contrast + practical action + final consequence.",
    detailedExplanation:
      "A stronger B2 answer should include a recommendation, a contrast marker, a concrete action, and a final sentence explaining the business outcome.",
    retryPrompt:
      "Give advice to a manager whose team is tired and behind schedule. Use: The way I see it, you ought to... Although... It might not be a bad idea to... This would help...",
    suggestedAnswer,
    sessionSummary,
  };
}

function selfTest() {
  const dashboard = baseV02Payload();
  const test3 = evaluatePractice("Despite Bogotá has many job opportunities, I prefer Cali.");
  const test4 = evaluatePractice("The way I see it, you ought to give the whole team some time off.");
  const test5 = evaluatePractice(
    "The way I see it, you ought to give the whole team some time off. Although the deadline is important, it might not be a bad idea to restart the project with a clearer plan so everyone knows what to prioritize. This would help the team recover while keeping the project aligned with business priorities."
  );

  const tests = [
    {
      id: "dashboard-entry",
      passed:
        dashboard.mission.currentPosition === "Unit 4 — Class 28" &&
        dashboard.mission.mode === "Reviewing" &&
        Boolean(dashboard.mission.nextRecommendedAction),
      result: "Dashboard shows current position, reviewing mode, and recommended action.",
    },
    {
      id: "current-class-player",
      passed:
        dashboard.currentClass.label === "Unit 4 — Class 28" &&
        Boolean(dashboard.currentClass.goal) &&
        dashboard.currentClass.resources.length > 0 &&
        dashboard.currentClass.requirementsToPass.length > 0,
      result: "Current class player has title, objective, resources, and pass requirements.",
    },
    {
      id: "although-vs-despite",
      passed:
        test3.detectedIssue === "Although vs despite" &&
        test3.grammar === "needs_work" &&
        test3.retryPrompt.toLowerCase().includes("although"),
      result: test3.quickCorrection,
    },
    {
      id: "incomplete-business-advice",
      passed:
        test4.grammar === "approved" &&
        test4.businessReasoning === "needs_work" &&
        test4.quickCorrection.includes("This would help the team recover"),
      result: test4.quickCorrection,
    },
    {
      id: "b2-acceptable-answer",
      passed:
        test5.grammar === "approved" &&
        test5.vocabulary === "approved" &&
        test5.businessReasoning === "approved" &&
        test5.eligibleForApproval === true,
      result: "Grammar, vocabulary, and business reasoning approved. Class practice is eligible for approval.",
    },
  ];

  return {
    ok: tests.every((test) => test.passed),
    version: "English OS v0.2 — Adaptive Learning UX",
    tests,
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
        ...baseV02Payload(rawContext, rawCurrentClass),
        warnings,
      });
    }

    if (action === "analyze_practice") {
      const answer = String(body.answer || body.transcript || "").trim();
      if (!answer) {
        return NextResponse.json({ ok: false, error: "Missing practice answer." }, { status: 400 });
      }

      const evaluation = evaluatePractice(answer);
      let mcpAnalysis: unknown = null;
      let mcpAnalysisError = "";

      try {
        mcpAnalysis = await callMcpTool(request, "conversation_analyze", {
          userEmail,
          transcript: `Learner practice answer:\n${answer}`,
          focus:
            body.focus ||
            "Evaluate B1 to B2 business advice with contrast, recurring mistakes, CEFR evidence, and strategic consequence.",
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
        automaticSessionSummary: evaluation.sessionSummary,
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

      const result = await callMcpTool(request, "english_os_approve_current_class_practice", {
        userEmail,
        confirm: true,
      });

      return NextResponse.json({
        ok: true,
        approved: true,
        advanced: false,
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
