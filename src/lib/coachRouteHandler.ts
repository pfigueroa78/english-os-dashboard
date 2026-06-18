import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ENGLISH_OS_COACH_BEHAVIOR_PROMPT } from "@/lib/englishOsCoachPrompt";
import { PASSAGES_TEACHER_STYLE_GUIDANCE } from "@/lib/passagesTeacherStyle";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_COACH_MODEL = process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_COACH_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_MAX_OUTPUT_TOKENS || 3600);

const FORBIDDEN_METADATA_MARKERS = [
  "Clase actual / contenido de clase",
  "viewing_current_class",
  "Extract exact",
  "Extract vocabulary",
  "Use the target language from the indexed page range",
  "anchored to Student Book pages",
];

const FORBIDDEN_METADATA_PATTERNS = [
  /\bclass pack\b/i,
  /\blocal class\b/i,
  /\bclass \d+\s*\/\s*class \d+ locally\b/i,
  /unit-\d{2}-local-class-/i,
  /CLASS_PACK_UNIT_/i,
];

type CoachMessage = { role: "user" | "coach"; content: string };
type CoachRequest = { message: string; conversationHistory?: CoachMessage[] };

type ClassIdentity = {
  lessonTitle: string;
  bookPages: string;
  pdfPages: string;
  sections: string;
  skillFocus: string;
};

function normalize(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(value: number | string) {
  return String(value).padStart(2, "0");
}

function extractRequestedUnitNumber(message: string): number | null {
  const match = normalize(message).match(/(?:unidad|unit)\s+(\d{1,2})/);
  return match?.[1] ? Number(match[1]) : null;
}

function extractRequestedClassNumber(message: string): number | null {
  const match = normalize(message).match(/(?:clase|class)\s+(\d{1,2})/);
  return match?.[1] ? Number(match[1]) : null;
}

function isGiveClassQuestion(message: string) {
  const n = normalize(message);
  return [
    "dame la clase",
    "dar la clase",
    "ensename la clase",
    "continua la clase",
    "continuar la clase",
    "empezar la clase",
    "empecemos la clase",
    "give me class",
    "teach me class",
    "start class",
    "continue class",
  ].some((phrase) => n.includes(phrase));
}

function isReviewQuestion(message: string) {
  const n = normalize(message);
  return (n.includes("repaso") || n.includes("repasar") || n.includes("review")) && (n.includes("unidad") || n.includes("unit"));
}

function classCoordinates(message: string, fallbackUnit?: string) {
  const unit = extractRequestedUnitNumber(message) || Number(String(fallbackUnit || "").match(/\d{1,2}/)?.[0] || 0) || null;
  const localClass = extractRequestedClassNumber(message);
  const globalClass = unit && localClass ? (unit - 1) * 7 + localClass : null;
  return { unit, localClass, globalClass };
}

function classPackFilename(unit: number, localClass: number) {
  const globalClass = (unit - 1) * 7 + localClass;
  return `unit-${pad2(unit)}-local-class-${pad2(localClass)}-global-class-${pad2(globalClass)}-class-pack-unit-${pad2(unit)}-class-${pad2(globalClass)}.md`;
}

function loadClassPack(unit: number, localClass: number) {
  const filename = classPackFilename(unit, localClass);
  const fullPath = path.join(process.cwd(), "knowledge", "class-packs-lesson-vision", filename);
  if (!fs.existsSync(fullPath)) return { filename, content: "" };
  return { filename, content: fs.readFileSync(fullPath, "utf8") };
}

function activeTeachingContract(content: string) {
  const heading = "### Active class teaching contract";
  const start = content.indexOf(heading);
  if (start < 0) return "";
  const safetyRule = content.indexOf("### Safety rule", start);
  const extractedContent = content.indexOf("## Extracted Student Book content", start);
  const candidates = [safetyRule, extractedContent].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : content.length;
  return content.slice(start, end).trim();
}

function contractField(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.match(new RegExp(`^- ${escaped}:\\s*([^\\n]+)`, "im"))?.[1]?.trim() || "";
}

function classIdentity(content: string): ClassIdentity {
  const contract = activeTeachingContract(content);
  return {
    lessonTitle: contractField(contract, "Lesson title"),
    bookPages: contractField(contract, "Active class book pages"),
    pdfPages: contractField(contract, "Active class PDF pages"),
    sections: contractField(contract, "Active class section names"),
    skillFocus: contractField(contract, "Active class skill focus"),
  };
}

function learnerName(context: any, fallback = "") {
  const user = context?.user || {};
  return String(user.Name || user.name || user["Full Name"] || context?.name || fallback || "").trim();
}

function learnerPositionLine(params: {
  context: any;
  name: string;
  requestedUnit: number;
  requestedClass?: number;
  review?: boolean;
}) {
  const user = params.context?.user || {};
  const currentUnit = user["Current Unit"] || params.context?.currentUnit || "";
  const currentLesson = user["Current Lesson"] || params.context?.currentLesson || "";
  const greeting = params.name ? `${params.name}, ` : "";
  const savedPosition = [currentUnit, currentLesson].filter(Boolean).join(" — ");
  const target = params.review
    ? `Unit ${params.requestedUnit} review`
    : `Unit ${params.requestedUnit}, Class ${params.requestedClass}`;

  if (savedPosition) {
    return `${greeting}I found your current position in English OS: **${savedPosition}**. You asked for **${target}**, so that is our active target now.`;
  }
  return `${greeting}you asked for **${target}**, so that is our active target now.`;
}

function stripModelOwnedIdentity(reply: string) {
  return String(reply || "")
    .split("\n")
    .filter((line) => {
      const clean = line.replace(/[*#]/g, "").trim();
      return !/^(Unit \d+\s*[—-]\s*Class \d+|Global Class|Lesson:|Book pages:|PDF pages:|Class sections:|Main focus:|Grammar focus:|Language support:|Vocabulary focus:)/i.test(clean);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderClassReply(params: {
  body: string;
  position: string;
  identity: ClassIdentity;
  unit: number;
  localClass: number;
}) {
  const identity = params.identity;
  const header = [
    `# Unit ${params.unit} — Class ${params.localClass}`,
    identity.lessonTitle ? `**Lesson:** ${identity.lessonTitle}` : "",
    identity.sections ? `**Learning path:** ${identity.sections}` : "",
    identity.skillFocus ? `**Skill focus:** ${identity.skillFocus}` : "",
    identity.bookPages || identity.pdfPages
      ? `**Course reference:** Book ${identity.bookPages || "—"} · PDF ${identity.pdfPages || "—"}`
      : "",
  ].filter(Boolean);

  return [params.position, "", ...header, "", stripModelOwnedIdentity(params.body)]
    .join("\n")
    .trim();
}

function renderReviewReply(params: { body: string; position: string; unit: number }) {
  return [params.position, "", `# Unit ${params.unit} — Strategic review`, "", stripModelOwnedIdentity(params.body)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadUnitTeachingContracts(unit: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const localClass = index + 1;
    const pack = loadClassPack(unit, localClass);
    return {
      localClass,
      filename: pack.filename,
      contract: activeTeachingContract(pack.content),
    };
  });
}

function getOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === "string") return openaiResponse.output_text.trim();
  const output = openaiResponse?.output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) => content?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function usage(openaiResponse: any) {
  const u = openaiResponse?.usage || {};
  return {
    inputTokens: Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0,
    outputTokens: Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0,
    totalTokens: Number(u.total_tokens ?? 0) || 0,
  };
}

function assertNoMetadataFallback(reply: string) {
  const found = FORBIDDEN_METADATA_MARKERS.find((marker) => reply.includes(marker));
  if (found) throw new Error(`Unsafe class reply contains metadata marker: ${found}`);
  const pattern = FORBIDDEN_METADATA_PATTERNS.find((candidate) => candidate.test(reply));
  if (pattern) throw new Error(`Unsafe class reply contains internal planning language: ${pattern}`);
}

function assertCompleteModelResponse(data: any, reply: string) {
  const reason = data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "";
  if (data?.status === "incomplete" || reason === "max_output_tokens") {
    throw new Error("The coach response reached its output limit before the class was complete. Please retry the class request.");
  }
  if (!reply.trim()) throw new Error("The coach returned an empty response.");
}

async function callEnglishOSAction(action: string, params: Record<string, string>) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return null;
  const url = new URL(ENGLISH_OS_BASE_URL);
  url.searchParams.set("token", ENGLISH_OS_TOKEN);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const data = await response.json().catch(() => null);
  return response.ok ? data : null;
}

async function getLearnerContext(email: string) {
  const data = await callEnglishOSAction("getLearnerContext", { userEmail: email, learnerId: email });
  if (!data?.ok) throw new Error(data?.error || "Unable to read learner context.");
  return data;
}

function buildClassInput(params: {
  message: string;
  learnerContext: any;
  classContent: any;
  classPack: string;
  filename: string;
  conversationHistory: CoachMessage[];
}) {
  return [
    {
      role: "system",
      content: `
${ENGLISH_OS_COACH_BEHAVIOR_PROMPT}

${PASSAGES_TEACHER_STYLE_GUIDANCE}

Hard rule for class delivery:
- Never answer a class request with a metadata table.
- Never expose internal modes such as viewing_current_class.
- Never expose placeholders such as Extract exact or Extract vocabulary.
- Use the class pack and lesson context as teacher planning input.
- Produce a didactic class: learner position, lesson header, warm-up, teacher explanation, examples, controlled practice, vocabulary/key language, speaking or writing practice, and evaluation gate.
- If the source is incomplete, say what is missing instead of inventing.
- Build one continuous teaching sequence. Each active section must reuse language or learner output from the previous section.
- Distinguish the complete lesson title from activity/subsection headings.
- Do not invent or attribute an audio transcript or answer key to people named in the source.
- The application renders learner position and lesson identity. Do not write the learner-position paragraph, Unit/Class header, Global Class, lesson title, pages, class sections, main focus, language support, or vocabulary-focus metadata.
- Start with the learning objective, then the communication mission, then the exact active teaching sections.
- Keep the complete response under 1,500 words. Use no more than two model examples per active section and avoid nested generic wrappers.
- Teach interactively: explain briefly, model, ask the learner to produce, and make the final instruction unmistakable.
- Use English for teaching. Use brief Spanish support only for a genuinely difficult B1/B2 concept or a known transfer error.
      `.trim(),
    },
    {
      role: "user",
      content: `
USER REQUEST:
${params.message}

LOCAL CLASS PACK FILE:
${params.filename}

CLASS PACK SOURCE:
${params.classPack.slice(0, 18000)}

ENGLISH OS LEARNER CONTEXT:
${JSON.stringify(params.learnerContext).slice(0, 5000)}

ENGLISH OS CLASS CONTENT RESPONSE:
${JSON.stringify(params.classContent).slice(0, 5000)}

RECENT CONVERSATION:
${JSON.stringify(params.conversationHistory).slice(0, 2500)}
      `.trim(),
    },
  ];
}

function buildGeneralInput(context: any, message: string, conversationHistory: CoachMessage[]) {
  return [
    {
      role: "system",
      content: `
${ENGLISH_OS_COACH_BEHAVIOR_PROMPT}

${PASSAGES_TEACHER_STYLE_GUIDANCE}

Answer as English OS Coach. If the learner is in review mode, use summary + mini-checkpoint. If correcting answers, use Cambridge-style correction.
      `.trim(),
    },
    {
      role: "user",
      content: `
LEARNER CONTEXT:
${JSON.stringify(context).slice(0, 7000)}

RECENT CONVERSATION:
${JSON.stringify(conversationHistory).slice(0, 2500)}

USER MESSAGE:
${message}
      `.trim(),
    },
  ];
}

function buildReviewInput(params: {
  message: string;
  learnerContext: any;
  unit: number;
  contracts: ReturnType<typeof loadUnitTeachingContracts>;
  conversationHistory: CoachMessage[];
}) {
  return [
    {
      role: "system",
      content: `
${ENGLISH_OS_COACH_BEHAVIOR_PROMPT}

${PASSAGES_TEACHER_STYLE_GUIDANCE}

Hard rule for unit review:
- Build the review from the seven supplied class teaching contracts, not from generic course knowledge.
- Synthesize the unit strategically; do not dump seven full classes.
- Include grammar review, vocabulary/useful expressions, speaking themes, model B1/B2 answers, and a mini-checkpoint.
- Explain and model target language before asking the learner to produce it.
- Do not expose filenames, class packs, retrieval details, or internal metadata.
- Do not use the class-mode metadata header. Never show Global Class numbers, book/PDF pages, or a combined list of every section.
- Use one realistic communication scenario as the thread connecting grammar, vocabulary, models, and checkpoint.
- Select at most two language priorities and 5-7 chunks. Include one B1 model and one stronger B2 model for the same prompt.
- Keep the complete review concise and finish with exactly four numbered checkpoint items.
- The application renders learner position and the review title. Do not repeat either one.
- Keep the review under 900 words and end by waiting for the learner's answers.
      `.trim(),
    },
    {
      role: "user",
      content: `
USER REQUEST:
${params.message}

ACTIVE REVIEW UNIT: ${params.unit}

VERIFIED TEACHING CONTRACTS FOR ALL SEVEN CLASSES:
${params.contracts.map((item) => `CLASS ${item.localClass}\n${item.contract}`).join("\n\n")}

ENGLISH OS LEARNER CONTEXT:
${JSON.stringify(params.learnerContext).slice(0, 5000)}

RECENT CONVERSATION:
${JSON.stringify(params.conversationHistory).slice(0, 2500)}
      `.trim(),
    },
  ];
}

async function callCoachModel(input: any[]) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_COACH_MODEL, input, max_output_tokens: OPENAI_COACH_MAX_OUTPUT_TOKENS }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
  return data;
}

export async function coachPost(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) return NextResponse.json({ ok: false, error: "No email found for current user." }, { status: 400 });

  const body = (await request.json()) as CoachRequest;
  const message = String(body.message || "").trim();
  const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-12) : [];
  if (!message) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });

  const context = await getLearnerContext(email);
  const user = context?.user || {};
  const learnerId = user["Learner ID"] || context?.learnerId || email;
  const currentUnit = user["Current Unit"] || context?.currentUnit || "";

  if (isGiveClassQuestion(message)) {
    const { unit, localClass, globalClass } = classCoordinates(message, currentUnit);
    if (!unit || !localClass) {
      return NextResponse.json({ ok: false, error: "I need both unit and class to teach a class." }, { status: 400 });
    }

    const classContent = await callEnglishOSAction("getClassContent", {
      unit: String(unit),
      classNumber: String(globalClass),
      userEmail: email,
      learnerId,
    });

    const { filename, content } = loadClassPack(unit, localClass);
    if (!content) {
      return NextResponse.json({ ok: false, error: `Missing local class pack: ${filename}` }, { status: 500 });
    }

    const openaiData = await callCoachModel(
      buildClassInput({ message, learnerContext: context, classContent, classPack: content, filename, conversationHistory })
    );
    const modelBody = getOutputText(openaiData);
    assertCompleteModelResponse(openaiData, modelBody);
    assertNoMetadataFallback(modelBody);
    const identity = classIdentity(content);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, clerkUser?.firstName || ""),
      requestedUnit: unit,
      requestedClass: localClass,
    });
    const reply = renderClassReply({ body: modelBody, position, identity, unit, localClass });
    const u = usage(openaiData);

    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      activeUnit: unit,
      activeClass: localClass,
      source: "Local Class Pack + Pedagogy Prompt",
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isReviewQuestion(message)) {
    const unit = extractRequestedUnitNumber(message) || Number(String(currentUnit).match(/\d{1,2}/)?.[0] || 0);
    if (!unit) return NextResponse.json({ ok: false, error: "I need a unit number for the review." }, { status: 400 });

    const contracts = loadUnitTeachingContracts(unit);
    const missing = contracts.filter((item) => !item.contract);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing teaching contracts for unit ${unit}: ${missing.map((item) => item.localClass).join(", ")}` },
        { status: 500 }
      );
    }

    const openaiData = await callCoachModel(
      buildReviewInput({ message, learnerContext: context, unit, contracts, conversationHistory })
    );
    const modelBody = getOutputText(openaiData);
    assertCompleteModelResponse(openaiData, modelBody);
    assertNoMetadataFallback(modelBody);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, clerkUser?.firstName || ""),
      requestedUnit: unit,
      review: true,
    });
    const reply = renderReviewReply({ body: modelBody, position, unit });
    const u = usage(openaiData);
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      activeUnit: unit,
      source: "Seven Local Teaching Contracts + Review Pedagogy Prompt",
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  const openaiData = await callCoachModel(buildGeneralInput(context, message, conversationHistory));
  const reply = getOutputText(openaiData);
  const u = usage(openaiData);
  return NextResponse.json({
    ok: true,
    agent: "coach",
    reply,
    usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
  });
}
