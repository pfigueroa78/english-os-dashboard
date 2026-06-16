import { NextResponse } from "next/server";
import { authenticateQaRequest } from "@/lib/qaServer";

export const runtime = "nodejs";

type Status = "approved" | "needs_work";

type PracticeEvaluation = {
  grammar: Status;
  vocabulary: Status;
  businessReasoning: Status;
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

function baseV02Payload(userEmail: string) {
  return {
    version: "English OS v0.2 — Adaptive Learning UX",
    qaMode: true,
    learner: {
      name: "Pedro",
      email: userEmail,
      learnerId: userEmail,
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
    warnings: ["QA mode is active. Write actions are simulated and no real learner progress is changed."],
  };
}

function evaluatePractice(answer: string): PracticeEvaluation {
  const normalized = answer.trim().replace(/\s+/g, " ");
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

  const hasAdvice = /the way i see it,\s*you ought to give the whole team some time off/i.test(normalized);
  const hasAlthough = /\balthough\b/i.test(normalized);
  const hasBadIdea = /it might not be a bad idea to/i.test(normalized);
  const hasPrioritize = /so everyone knows what to prioritize/i.test(normalized);
  const hasConsequence = /this would help/i.test(normalized);
  const hasBusinessPriorities = /business priorities/i.test(normalized);

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

  if (hasAdvice) {
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

  return {
    grammar: lower.length > 20 ? "approved" : "needs_work",
    vocabulary: lower.includes("business") || lower.includes("prioritize") ? "approved" : "needs_work",
    businessReasoning: hasConsequence ? "approved" : "needs_work",
    eligibleForApproval: false,
    detectedIssue: "Needs fuller B2 business structure",
    quickCorrection: "Build the answer with: advice + contrast + practical action + final consequence.",
    detailedExplanation:
      "A stronger B2 answer should include a recommendation, a contrast marker, a concrete action, and a final sentence explaining the business outcome.",
    retryPrompt:
      "Give advice to a manager whose team is tired and behind schedule. Use: The way I see it, you ought to... Although... It might not be a bad idea to... This would help...",
    suggestedAnswer,
    sessionSummary,
  };
}

function requireQa(request: Request) {
  const qa = authenticateQaRequest(request);
  if (!qa.ok) throw new Error("QA authentication required.");
  return qa;
}

export async function GET(request: Request) {
  try {
    requireQa(request);
    return NextResponse.json({ ok: true, version: "English OS v0.2 — QA Student Mode", endpoint: "/api/english-os/v02-qa" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const qa = requireQa(request);
    const body = (await request.json()) as { action?: string; userEmail?: string; answer?: string; transcript?: string; confirm?: boolean };
    const action = body.action || "bootstrap";
    const userEmail = body.userEmail || qa.email;

    if (action === "bootstrap") return NextResponse.json({ ok: true, ...baseV02Payload(userEmail) });

    if (action === "analyze_practice") {
      const answer = String(body.answer || body.transcript || "").trim();
      if (!answer) return NextResponse.json({ ok: false, error: "Missing practice answer." }, { status: 400 });
      const evaluation = evaluatePractice(answer);
      return NextResponse.json({
        ok: true,
        qaMode: true,
        answer,
        evaluation,
        mcpAnalysis: {
          reply: "QA analysis: same student UI and evaluation contract. External logging and real progression are disabled in QA mode.",
        },
        automaticSessionSummary: evaluation.sessionSummary,
        autoAdvance: false,
        advanceRule: "QA mode never advances or changes the real learner automatically.",
      });
    }

    if (action === "approve_practice") {
      if (body.confirm !== true) return NextResponse.json({ ok: false, error: "Explicit confirmation required." }, { status: 400 });
      return NextResponse.json({ ok: true, qaMode: true, approved: true, advanced: false });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 401 });
  }
}
