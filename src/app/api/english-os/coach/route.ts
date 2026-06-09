import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_COACH_MODEL = process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_COACH_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_COACH_MAX_OUTPUT_TOKENS || 900
);

const INPUT_COST_PER_1M = Number(
  process.env.OPENAI_COACH_INPUT_COST_PER_1M || 0
);

const OUTPUT_COST_PER_1M = Number(
  process.env.OPENAI_COACH_OUTPUT_COST_PER_1M || 0
);

type CoachRequest = {
  message: string;
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

  const inputTokens =
    Number(
      usage.input_tokens ??
        usage.prompt_tokens ??
        usage.inputTokens ??
        0
    ) || 0;

  const outputTokens =
    Number(
      usage.output_tokens ??
        usage.completion_tokens ??
        usage.outputTokens ??
        0
    ) || 0;

  const totalTokens =
    Number(
      usage.total_tokens ??
        usage.totalTokens ??
        inputTokens + outputTokens
    ) || inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
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
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  activity: string;
}) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return;

  await fetch(ENGLISH_OS_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      token: ENGLISH_OS_TOKEN,
      action: "logAIUsage",
      aiUsage: {
        timestamp: new Date().toISOString(),
        userEmail: params.userEmail,
        learnerId: params.learnerId,
        agent: "coach",
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.totalTokens,
        estimatedCostUSD: params.estimatedCostUSD,
        activity: params.activity,
        requestSource: "Dashboard /coach",
        notes: "Coach text interaction",
      },
    }),
  });
}

async function logDailySession(params: {
  userEmail: string;
  learnerId: string;
  userMessage: string;
  coachReply: string;
  currentUnit: string;
  currentLesson: string;
  currentCEFR: string;
}) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return;

  await fetch(ENGLISH_OS_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      token: ENGLISH_OS_TOKEN,
      sourceAgent: "English OS Dashboard Coach",
      userEmail: params.userEmail,
      learnerId: params.learnerId,
      unit: params.currentUnit,
      lesson: params.currentLesson,
      currentCEFR: params.currentCEFR,
      dailyLog: {
        date: getToday(),
        skill: "Coaching",
        activity: "Dashboard Coach text interaction",
        mainTopic: params.userMessage.slice(0, 180),
        time: "Dashboard session",
        summary: params.coachReply.slice(0, 900),
        weakness: "",
        newVocabulary: "",
        nextAction: "Continue with the next recommended English OS activity.",
      },
    }),
  });
}

function buildCoachPrompt(context: any, message: string) {
  const user = context?.user || {};
  const missionControl = context?.missionControl || {};
  const nextRecommendedAction =
    context?.nextRecommendedAction ||
    context?.recommendation ||
    context?.nextAction ||
    "";

  const recentDailyLogs =
    context?.recentDailyLogs ||
    context?.dailyLogs ||
    context?.logs ||
    [];

  const recurringMistakes =
    context?.recurringMistakes ||
    context?.mistakes ||
    [];

  const vocabulary =
    context?.vocabularyIntelligence ||
    context?.vocabulary ||
    [];

  const currentUnit =
    user["Current Unit"] ||
    context?.currentUnit ||
    missionControl?.currentUnit ||
    "";

  const currentLesson =
    user["Current Lesson"] ||
    context?.currentLesson ||
    missionControl?.currentLesson ||
    "";

  const currentCEFR =
    user["Current CEFR"] ||
    context?.currentCEFR ||
    missionControl?.currentCEFR ||
    "B1";

  const learnerName =
    user["Name"] ||
    context?.name ||
    "the learner";

  return [
    {
      role: "system",
      content: `
You are English OS Coach, Pedro's personal English coach.

Your job:
- Help the learner progress from B1/B1+ to B2.
- Focus on professional English, business communication, consulting, enterprise architecture, software architecture, AI, and digital transformation.
- Use English most of the time.
- Use Spanish only when the explanation is complex or when it helps clarity.
- Be practical, structured, motivating, and direct.
- Always adapt to the learner's current unit, lesson, CEFR level, recurring mistakes, and next recommended action.
- Do not invent progress data. Use only the provided English OS context.
- At the end, give one short next action.

Response style:
- Start with a direct answer.
- Correct important English mistakes when relevant.
- Give examples.
- Keep the answer useful for a B1+/B2 learner.
- Avoid very long theory unless the user asks for it.
      `.trim(),
    },
    {
      role: "user",
      content: `
ENGLISH OS CONTEXT

Learner:
${learnerName}

Current CEFR:
${currentCEFR}

Current Unit:
${currentUnit || "Not defined"}

Current Lesson:
${currentLesson || "Not defined"}

Next Recommended Action:
${typeof nextRecommendedAction === "string" ? nextRecommendedAction : JSON.stringify(nextRecommendedAction)}

Recent Daily Logs:
${JSON.stringify(recentDailyLogs).slice(0, 3000)}

Recurring Mistakes:
${JSON.stringify(recurringMistakes).slice(0, 2500)}

Vocabulary Intelligence:
${JSON.stringify(vocabulary).slice(0, 2500)}

USER MESSAGE:
${message}
      `.trim(),
    },
  ];
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress;

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: "No email found for current user.",
        },
        { status: 400 }
      );
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing OPENAI_API_KEY.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as CoachRequest;
    const message = String(body.message || "").trim();

    if (!message) {
      return NextResponse.json(
        {
          ok: false,
          error: "Message is required.",
        },
        { status: 400 }
      );
    }

    const context = await getLearnerContext(email);

    const user = context?.user || {};
    const active = String(user["Active"] ?? "").toLowerCase();

    if (!user || active === "false") {
      return NextResponse.json(
        {
          ok: false,
          error: "User is not authorized in English OS.",
        },
        { status: 403 }
      );
    }

    const currentUnit =
      user["Current Unit"] ||
      context?.currentUnit ||
      "";

    const currentLesson =
      user["Current Lesson"] ||
      context?.currentLesson ||
      "";

    const currentCEFR =
      user["Current CEFR"] ||
      context?.currentCEFR ||
      "B1";

    const learnerId =
      user["Learner ID"] ||
      context?.learnerId ||
      email;

    const input = buildCoachPrompt(context, message);

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_COACH_MODEL,
        input,
        max_output_tokens: OPENAI_COACH_MAX_OUTPUT_TOKENS,
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
    const estimatedCostUSD = estimateCostUSD(
      usage.inputTokens,
      usage.outputTokens
    );

    await logAIUsage({
      userEmail: email,
      learnerId,
      model: OPENAI_COACH_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUSD,
      activity: message.slice(0, 180),
    });

    await logDailySession({
      userEmail: email,
      learnerId,
      userMessage: message,
      coachReply: reply,
      currentUnit,
      currentLesson,
      currentCEFR,
    });

    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      usage: {
        model: OPENAI_COACH_MODEL,
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
