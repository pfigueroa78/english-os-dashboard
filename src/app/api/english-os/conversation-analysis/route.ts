import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getOpenAIClient,
  getResponseOutputText,
  getResponseTokenUsage,
} from "@/lib/openaiSdk";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;
const OPENAI_ANALYSIS_MODEL =
  process.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS || 1800
);
const INPUT_COST_PER_1M = Number(process.env.OPENAI_COACH_INPUT_COST_PER_1M || 0);
const OUTPUT_COST_PER_1M = Number(process.env.OPENAI_COACH_OUTPUT_COST_PER_1M || 0);

type ConversationMessage = {
  role: "user" | "coach";
  content: string;
};

type ConversationAnalysisRequest = {
  messages: ConversationMessage[];
  focus?: string;
  previousResponseId?: string;
};

function estimateCostUSD(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M;
  return Number((inputCost + outputCost).toFixed(8));
}

function normalizeMessages(messages: ConversationMessage[]) {
  return messages
    .filter((message) => message && typeof message.content === "string")
    .slice(-40)
    .map((message) => ({
      role: message.role === "user" ? "user" : "coach",
      content: message.content.slice(0, 5000),
    }));
}

function buildTranscript(messages: ConversationMessage[]) {
  return normalizeMessages(messages)
    .map((message, index) => {
      const speaker = message.role === "user" ? "Learner" : "Coach";
      return `Turn ${index + 1} — ${speaker}:\n${message.content}`;
    })
    .join("\n\n---\n\n");
}

function clipJson(value: unknown, max = 3500) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

async function getLearnerContext(email: string) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return null;

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
  if (!response.ok || data?.ok === false) return null;
  return data;
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

    const body = (await request.json()) as ConversationAnalysisRequest;
    const messages = Array.isArray(body.messages) ? normalizeMessages(body.messages) : [];

    if (!messages.length) {
      return NextResponse.json({ ok: false, error: "No conversation messages were provided." }, { status: 400 });
    }

    const learnerContext = await getLearnerContext(email);
    const openai = getOpenAIClient();
    const focus = String(body.focus || "").slice(0, 1000).trim();
    const previousResponseId = String(body.previousResponseId || "").trim();

    const response = await openai.responses.create({
      model: OPENAI_ANALYSIS_MODEL,
      previous_response_id: previousResponseId || undefined,
      input: [
        {
          role: "developer",
          content: [
            "You are an English OS conversation analyst.",
            "Analyze the learner-coach frontend conversation as a learning system artifact.",
            "Give a compact but deep analysis in Spanish with English examples when useful.",
            "Focus on learning quality, evidence of progress, unresolved mistakes, lesson-contract risks, UI/product signals, and next actions.",
            "Do not invent progress data.",
            "Return Markdown with these headings: Diagnóstico ejecutivo, Evidencia, Riesgos, Mejoras pedagógicas, Mejoras UI/frontend, Próximos pasos.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "User account:",
            email,
            "",
            "Requested analysis focus:",
            focus || "General deep learning and frontend analysis.",
            "",
            "English OS runtime context:",
            clipJson(learnerContext, 4500) || "No runtime context available.",
            "",
            "Frontend conversation transcript:",
            buildTranscript(messages),
          ].join("\n"),
        },
      ],
      max_output_tokens: OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS,
    } as any);

    const reply = getResponseOutputText(response) || "No analysis returned.";
    const usage = getResponseTokenUsage(response);
    const estimatedCostUSD = estimateCostUSD(usage.inputTokens, usage.outputTokens);

    return NextResponse.json({
      ok: true,
      agent: "conversation_analysis",
      reply,
      responseId: response.id || "",
      source: "OpenAI SDK / Responses API",
      usage: {
        model: OPENAI_ANALYSIS_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUSD,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
