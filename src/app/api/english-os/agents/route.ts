import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { toCoachAgentClientContracts } from "@/modules/coach-integrations/agentsContract";
import { renderServerPrompt, type ServerPromptId } from "@/modules/coach-prompts/serverPromptRegistry";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_AGENT_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_AGENT_MAX_OUTPUT_TOKENS || process.env.OPENAI_COACH_MAX_OUTPUT_TOKENS || 900
);

const INPUT_COST_PER_1M = Number(process.env.OPENAI_COACH_INPUT_COST_PER_1M || 0);
const OUTPUT_COST_PER_1M = Number(process.env.OPENAI_COACH_OUTPUT_COST_PER_1M || 0);

type AgentId = "grammar_corrector" | "speaking_partner" | "english_evaluator";

type AgentRequest = {
  agentId: AgentId;
  message: string;
};

type AgentConfig = {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  defaultPromptId: ServerPromptId;
  systemPromptId: ServerPromptId;
  skill: string;
  activity: string;
  logNotes: string;
};

const AGENTS: Record<AgentId, AgentConfig> = {
  grammar_corrector: {
    id: "grammar_corrector",
    name: "Grammar Corrector",
    shortName: "Gramática",
    description: "Corrige estructura, artículos, preposiciones y naturalidad.",
    defaultPromptId: "agents.grammarCorrector.default",
    systemPromptId: "agents.grammarCorrector.system",
    skill: "Grammar",
    activity: "Specialist grammar correction",
    logNotes: "Grammar Corrector agent interaction",
  },

  speaking_partner: {
    id: "speaking_partner",
    name: "Speaking Partner",
    shortName: "Speaking",
    description: "Practica conversación, fluidez y respuestas profesionales.",
    defaultPromptId: "agents.speakingPartner.default",
    systemPromptId: "agents.speakingPartner.system",
    skill: "Speaking",
    activity: "Specialist speaking practice",
    logNotes: "Speaking Partner agent interaction",
  },

  english_evaluator: {
    id: "english_evaluator",
    name: "English Evaluator",
    shortName: "Evaluar",
    description: "Evalúa CEFR, precisión, vocabulario y próximos pasos.",
    defaultPromptId: "agents.englishEvaluator.default",
    systemPromptId: "agents.englishEvaluator.system",
    skill: "Evaluation",
    activity: "Specialist English evaluation",
    logNotes: "English Evaluator agent interaction",
  },
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === "string") {
    return openaiResponse.output_text;
  }

  const output = openaiResponse?.output;

  if (Array.isArray(output)) {
    const parts: string[] = [];

    for (const item of output) {
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (typeof content?.text === "string") {
            parts.push(content.text);
          }
        }
      }
    }

    return parts.join("\n").trim();
  }

  return "";
}

function getTokenUsage(openaiResponse: any) {
  const usage = openaiResponse?.usage || {};

  const inputTokens = Number(
    usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? 0
  ) || 0;

  const outputTokens = Number(
    usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? 0
  ) || 0;

  const totalTokens = Number(
    usage.total_tokens ?? usage.totalTokens ?? inputTokens + outputTokens
  ) || inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

function estimateCostUSD(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M;
  return Number((inputCost + outputCost).toFixed(8));
}

async function getLearnerContext(email: string) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) {
    throw new Error("Missing English OS environment variables.");
  }

  const url = new URL(ENGLISH_OS_BASE_URL);
  url.searchParams.set("token", ENGLISH_OS_TOKEN);
  url.searchParams.set("action", "getLearnerContext");
  url.searchParams.set("userEmail", email);
  url.searchParams.set("learnerId", email);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Unable to read learner context.");
  }

  return data;
}

async function logAIUsage(params: {
  userEmail: string;
  learnerId: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  activity: string;
  notes: string;
}) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return;

  await fetch(ENGLISH_OS_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      token: ENGLISH_OS_TOKEN,
      action: "logAIUsage",
      userEmail: params.userEmail,
      learnerId: params.learnerId,
      aiUsage: {
        timestamp: new Date().toISOString(),
        userEmail: params.userEmail,
        learnerId: params.learnerId,
        agent: params.agent,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.totalTokens,
        estimatedCostUSD: params.estimatedCostUSD,
        activity: params.activity,
        requestSource: "Dashboard /agents",
        notes: params.notes,
      },
    }),
  });
}

async function logDailySession(params: {
  userEmail: string;
  learnerId: string;
  agentName: string;
  skill: string;
  activity: string;
  userMessage: string;
  reply: string;
  currentUnit: string;
  currentLesson: string;
  currentCEFR: string;
}) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return;

  await fetch(ENGLISH_OS_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      token: ENGLISH_OS_TOKEN,
      sourceAgent: `English OS ${params.agentName}`,
      userEmail: params.userEmail,
      learnerId: params.learnerId,
      unit: params.currentUnit,
      lesson: params.currentLesson,
      currentCEFR: params.currentCEFR,
      dailyLog: {
        date: getToday(),
        skill: params.skill,
        activity: params.activity,
        mainTopic: params.userMessage.slice(0, 180),
        time: "Dashboard specialist agent session",
        summary: params.reply.slice(0, 900),
        weakness: "",
        newVocabulary: "",
        nextAction: "Continue with the next recommended English OS activity.",
      },
    }),
  });
}

async function buildAgentPrompt(agent: AgentConfig, context: any, message: string) {
  const user = context?.user || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || {};

  const currentUnit = user["Current Unit"] || missionControl?.currentUnit || "Not defined";
  const currentLesson = user["Current Lesson"] || missionControl?.currentLesson || "Not defined";
  const currentCEFR = user["Current CEFR"] || missionControl?.currentCEFR || "B1+";
  const learnerName = user["Name"] || "the learner";
  const systemPrompt = await renderServerPrompt(agent.systemPromptId);
  const contextPrompt = await renderServerPrompt("agents.contextMessage", {
    learnerName,
    currentCEFR,
    currentUnit,
    currentLesson,
    recentDailyLogs: JSON.stringify(context?.recentDailyLogs || []).slice(0, 2500),
    recurringMistakes: JSON.stringify(context?.recentMistakes || context?.mistakes || []).slice(0, 2500),
    activeVocabulary: JSON.stringify(context?.activeVocabulary || context?.vocabulary || []).slice(0, 2500),
    message,
  });

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: contextPrompt,
    },
  ];
}

export async function GET() {
  const agentContracts = await Promise.all(Object.values(AGENTS).map(async (agent) => ({
    ...agent,
    defaultPrompt: await renderServerPrompt(agent.defaultPromptId),
  })));

  return NextResponse.json({
    ok: true,
    agents: toCoachAgentClientContracts(agentContracts),
  });
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress;

    if (!email) {
      return NextResponse.json({ ok: false, error: "No email found for current user." }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const body = (await request.json()) as AgentRequest;
    const agentId = body.agentId;
    const message = String(body.message || "").trim();
    const agent = AGENTS[agentId];

    if (!agent) {
      return NextResponse.json({ ok: false, error: "Unknown agentId." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    const context = await getLearnerContext(email);
    const user = context?.user || {};
    const active = String(user["Active"] ?? "").toLowerCase();

    if (!user || active === "false") {
      return NextResponse.json({ ok: false, error: "User is not authorized in English OS." }, { status: 403 });
    }

    const currentUnit = user["Current Unit"] || context?.currentUnit || "";
    const currentLesson = user["Current Lesson"] || context?.currentLesson || "";
    const currentCEFR = user["Current CEFR"] || context?.currentCEFR || "B1";
    const learnerId = user["Learner ID"] || context?.learnerId || email;

    const input = await buildAgentPrompt(agent, context, message);

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_AGENT_MODEL,
        input,
        max_output_tokens: OPENAI_AGENT_MAX_OUTPUT_TOKENS,
      }),
    });

    const openaiData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: openaiData?.error?.message || "OpenAI request failed.",
          details: openaiData,
        },
        { status: 500 }
      );
    }

    const reply = getOutputText(openaiData);
    const usage = getTokenUsage(openaiData);
    const estimatedCostUSD = estimateCostUSD(usage.inputTokens, usage.outputTokens);

    await logAIUsage({
      userEmail: email,
      learnerId,
      agent: agent.id,
      model: OPENAI_AGENT_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUSD,
      activity: message.slice(0, 180),
      notes: agent.logNotes,
    });

    await logDailySession({
      userEmail: email,
      learnerId,
      agentName: agent.name,
      skill: agent.skill,
      activity: agent.activity,
      userMessage: message,
      reply,
      currentUnit,
      currentLesson,
      currentCEFR,
    });

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        skill: agent.skill,
      },
      reply,
      usage: {
        model: OPENAI_AGENT_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUSD,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
