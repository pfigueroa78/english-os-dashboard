import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getApiLearnerIdentity } from "@/lib/apiLearnerIdentity";
import { ENGLISH_OS_COACH_BEHAVIOR_PROMPT } from "@/lib/englishOsCoachPrompt";
import { PASSAGES_TEACHER_STYLE_GUIDANCE } from "@/lib/passagesTeacherStyle";
import { renderServerPrompt } from "@/modules/coach-prompts/serverPromptRegistry";
import {
  hasExplicitClassCoordinates,
  isGiveClassQuestion,
  isReviewIntent,
  normalizeCoachMessage as normalize,
  unitGuideIntentKind,
} from "@/lib/coachIntent";
import { createCoachSessionContract, legacyActiveClass, legacyActiveUnit } from "@/modules/coach-session/contract";
import {
  mergeClassTargetWithPayload,
  resolveClassTargetFromMessage,
  resolveUnitTarget,
} from "@/modules/coach-target/resolve";
import passagesUnitTitles from "../../knowledge/passages-unit-titles.json";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_COACH_MODEL = process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_COACH_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_MAX_OUTPUT_TOKENS || 8000);
const OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS || 12000);

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
type CoachImageAttachment = { dataUrl: string; mimeType?: string; name?: string };
type CoachRequest = { message: string; conversationHistory?: CoachMessage[]; image?: CoachImageAttachment };

type ClassIdentity = {
  lessonTitle: string;
  bookPages: string;
  pdfPages: string;
  sections: string;
  skillFocus: string;
};

function pad2(value: number | string) {
  return String(value).padStart(2, "0");
}

function isReviewQuestion(message: string) {
  return isReviewIntent(message);
}

function unitGuideKind(message: string): "grammar" | "vocabulary" | null {
  return unitGuideIntentKind(message);
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

function unitTitle(unit: number) {
  const units = passagesUnitTitles.units as Record<string, string>;
  return String(units[String(unit)] || "").trim();
}

function openingSectionInstruction(sectionList: string) {
  const section = sectionList.split("+")[0]?.trim() || "Starting point";
  const normalized = section.toLowerCase();

  if (normalized === "starting point") {
    return `OPENING SECTION: ${section}. Activate the topic only. Give at most two short model reactions and ask one personal or situational question. Do not teach grammar rules, structure tables, or vocabulary lists yet.`;
  }
  if (normalized.includes("listening")) {
    return `OPENING SECTION: ${section}. Provide one short teacher-created listening input when exact audio is unavailable, then ask one gist question and at most one detail question. Do not begin later role-play, grammar, discussion, or writing sections.`;
  }
  if (normalized.includes("vocabulary")) {
    return `OPENING SECTION: ${section}. Teach at most five contract-supported chunks with two short models, then ask one compact reuse task. Do not begin later sections.`;
  }
  if (normalized.includes("grammar")) {
    return `OPENING SECTION: ${section}. Explain one target structure briefly, give two examples, and ask two controlled items. Do not begin later sections.`;
  }
  if (normalized.includes("discussion") || normalized.includes("speaking") || normalized.includes("role play")) {
    return `OPENING SECTION: ${section}. Set one realistic communication situation, give two short model turns, and ask one compact spoken or written response. Do not begin later sections.`;
  }
  if (normalized.includes("video") || normalized.includes("before watching")) {
    return `OPENING SECTION: ${section}. Do only the before-watching activation with one prediction task. Do not invent video content or begin later sections.`;
  }
  return `OPENING SECTION: ${section}. Teach only this section with two short models and one learner task. Do not begin later sections.`;
}

function learnerName(context: any, fallback = "") {
  const user = context?.user || {};
  return String(user.Name || user.name || user["Full Name"] || context?.name || fallback || "").trim();
}

function learnerFriendlySavedPosition(value: string) {
  return String(value || "")
    .replace(/^Passages\s+Level\s+\d+\s*[-—]\s*/i, "")
    .replace(/^Passages\s+Level\s+\d+\s*/i, "")
    .trim();
}

function learnerPositionLine(params: {
  context: any;
  name: string;
  requestedUnit: number;
  requestedClass?: number;
  review?: boolean;
  guideKind?: "grammar" | "vocabulary";
  explicitClassRequest?: boolean;
}) {
  const user = params.context?.user || {};
  const learningState = params.context?.learningState || {};
  const classIndex = params.context?.currentClassIndex || {};
  const currentUnit = learningState.currentUnit || classIndex.unit || user["Current Unit"] || params.context?.currentUnit || "";
  const currentClass = learningState.currentClass || classIndex.classNumber || "";
  const greeting = params.name ? `${params.name}, ` : "";
  const target = params.guideKind
    ? `Unit ${params.requestedUnit} ${params.guideKind === "grammar" ? "grammar guide" : "vocabulary guide"}`
    : params.review
      ? `Unit ${params.requestedUnit} review`
      : `Unit ${params.requestedUnit}, Class ${params.requestedClass}`;
  const activeTargetMatches =
    String(currentUnit || "").trim() === String(params.requestedUnit) &&
    (!params.requestedClass || String(currentClass || "").trim() === String(params.requestedClass));

  if (params.review || params.guideKind || params.explicitClassRequest) {
    return greeting ? `${greeting}trabajaremos con **${target}**.` : `Trabajaremos con **${target}**.`;
  }

  if (activeTargetMatches) {
    return greeting ? `${greeting}encontré tu clase activa en English OS: **${target}**.` : `Encontré tu clase activa en English OS: **${target}**.`;
  }

  return greeting ? `${greeting}vamos con **${target}**.` : `Vamos con **${target}**.`;
}

function stripModelOwnedIdentity(reply: string) {
  return String(reply || "")
    .split("\n")
    .filter((line) => {
      const clean = line.replace(/[*#]/g, "").trim();
      return !/^(Unit \d+\b|Class:|Global Class|Lesson:|Book pages:|PDF pages:|Class sections:|Main focus:|Grammar focus:|Language support:|Vocabulary focus:)/i.test(clean);
    })
    .filter((line) => {
      const clean = line.replace(/[*#]/g, "").trim();
      return !/(?:found your (?:saved|current) (?:position|english os position)|you asked for\s+unit\s+\d+|active learning target for this request|for this request,? the active|en modo\s+viewing_current_class|mode\s+viewing_current_class)/i.test(clean);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeLearnerFacingReply(reply: string) {
  return String(reply || "")
    .replace(/\bviewing_current_class\b/gi, "clase activa")
    .replace(/\bviewing current class\b/gi, "clase activa")
    .replace(/\bPassages\s+Level\s+\d+\s*[-—]\s*/gi, "")
    .replace(/\bPassages\s+Level\s+\d+\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasTerminalPunctuation(value: string) {
  return /[.!?:;…)](?:\s*[*_`>]+)?$/.test(String(value || "").trim());
}

function ensureTerminalPeriod(value: string) {
  const text = String(value || "").trim();
  if (!text || hasTerminalPunctuation(text)) return text;
  return `${text}.`;
}

function readableMarkdownPunctuation(reply: string) {
  return String(reply || "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      const heading = line.match(/^(\s*#{1,6}\s+)(.+?)(\s*)$/);
      if (heading) return `${heading[1]}${ensureTerminalPeriod(heading[2])}${heading[3]}`;

      const labelLine = line.match(/^(\s*(?:[-*]\s+)?(?:\*\*)?(?:Learning objective|Communication mission|Main focus|Skill focus|Grammar focus|Vocabulary focus|Language support|Your turn|Try|Model answers?)(?::\*\*|\*\*:|:)\s+)(.+?)(\s*)$/i);
      if (labelLine) return `${labelLine[1]}${ensureTerminalPeriod(labelLine[2])}${labelLine[3]}`;

      return line;
    })
    .join("\n");
}

const PREMATURE_CLASS_CLOSURE = /^(evaluation gate|recap|main achievement|main weakness|priority correction|new vocabulary\/chunks|next action|session logged(?: in english os)?)[\s:]*$/i;

function stripPrematureClassClosure(reply: string) {
  const lines = String(reply || "").split("\n");
  const boundary = lines.findIndex((line) => {
    const clean = line.replace(/[*#]/g, "").trim();
    return PREMATURE_CLASS_CLOSURE.test(clean);
  });
  const kept = boundary >= 0 ? lines.slice(0, boundary) : lines;
  return kept
    .filter((line) => !/session logged(?: in english os)?/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitToOpeningClassTurn(reply: string, sectionList: string) {
  const sections = sectionList.split("+").map((section) => section.trim()).filter(Boolean);
  if (sections.length < 2) return stripPrematureClassClosure(reply);

  const laterSections = new Set(sections.slice(1).map((section) => section.toLowerCase()));
  const lines = stripPrematureClassClosure(reply).split("\n");
  const boundary = lines.findIndex((line) => {
    const trimmed = line.trim();
    const looksLikeHeading = /^#{1,6}\s+/.test(trimmed) || /^\*\*[^*]+\*\*:?$/.test(trimmed);
    const clean = trimmed.replace(/^#{1,6}\s+/, "").replace(/[*:]/g, "").trim().toLowerCase();
    return looksLikeHeading && laterSections.has(clean);
  });
  return (boundary >= 0 ? lines.slice(0, boundary) : lines).join("\n").trim();
}

const CLASS_CONFIRMATION_DETOUR = /(?:current english os position is different|saved position is different|different from unit|can't start|cannot start|without your confirmation|please reply with one option|continue my current class|continue the current class|review unit \d+ overview)/i;

function stripClassConfirmationDetours(reply: string) {
  const lines = String(reply || "").split("\n");
  const boundary = lines.findIndex((line) => CLASS_CONFIRMATION_DETOUR.test(line.replace(/[*"“”]/g, "").trim()));
  const kept = boundary >= 0 ? lines.slice(0, boundary) : lines;
  return kept
    .filter((line) => !/^\s*\d+\.\s*["“]?(?:start unit|continue my current class|continue the current class|review unit)/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function learnerFriendlyFocus(value: string) {
  return String(value || "")
    .trim()
    .replace(/^The class is not grammar-centered;\s*(?:it focuses on|its real focus is|the real focus is)\s*/i, "")
    .replace(/^This class is not grammar-centered;\s*(?:it focuses on|its real focus is|the real focus is|the main skill focus is)\s*/i, "")
    .replace(/^Not grammar-centered;\s*(?:the visible skill focus is|the skill focus is)\s*/i, "")
    .replace(/^The class is grammar-centered,\s*with\s*/i, "")
    .replace(/^This class is grammar-centered,\s*with\s*/i, "")
    .replace(/^The class is grammar-centered,\s*/i, "")
    .replace(/^This class is grammar-centered,\s*/i, "")
    .replace(/\.$/, "")
    .trim();
}

function ensureMinimumOpeningTask(reply: string, identity: ClassIdentity) {
  const text = String(reply || "").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 30 && /\b(your turn|try|answer|write|tell me|prediction|predict|responde|escribe)\b/i.test(text)) return text;

  const firstSection = identity.sections.split("+")[0]?.trim() || identity.lessonTitle || "Starting point";
  if (/video|before watching/i.test(firstSection)) {
    return [
      text,
      "",
      "Let’s start with a short prediction before watching. Think about the lesson topic and answer in English:",
      "",
      "1. What do you think this video will show?",
      "2. Which Unit language do you expect to use in your answer?",
      "",
      "Write two short sentences. I’ll use your answer to continue with the next step.",
    ].filter(Boolean).join("\n");
  }
  return [
    text,
    "",
    "Let’s start with one small step. Answer in English with two short sentences about the lesson topic. I’ll continue from your answer.",
  ].filter(Boolean).join("\n");
}

function renderClassReply(params: {
  body: string;
  position: string;
  identity: ClassIdentity;
  unit: number;
  localClass: number;
}) {
  const identity = params.identity;
  const title = unitTitle(params.unit);
  const displayLesson = identity.lessonTitle || identity.sections.split("+")[0]?.trim() || "Class session";
  const formattedSkillFocus = learnerFriendlyFocus(identity.skillFocus.split(",").map((item) => item.trim()).filter(Boolean).join(", "));
  const teachingBody = ensureMinimumOpeningTask(
    stripClassConfirmationDetours(limitToOpeningClassTurn(stripModelOwnedIdentity(params.body), identity.sections)),
    identity,
  );
  const reference = [
    `class ${params.localClass}`,
    displayLesson,
  ].filter(Boolean).join(" · ");
  const header = [
    `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""}`)}`,
    `Hoy trabajaremos **${reference}**.`,
    "",
    formattedSkillFocus
      ? `Focus: **${formattedSkillFocus}**. Iremos paso a paso.`
      : "Iremos paso a paso.",
    "",
    identity.sections ? `Empezamos con **${identity.sections.split("+")[0]?.trim() || displayLesson}**.` : "",
  ].filter(Boolean);

  return readableMarkdownPunctuation(sanitizeLearnerFacingReply([params.position, "", ...header, "", teachingBody]
    .join("\n")
    .trim()));
}

function renderReviewReply(params: { body: string; position: string; unit: number }) {
  const title = unitTitle(params.unit);
  return readableMarkdownPunctuation([params.position, "", `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""} — Strategic review`)}`, "", stripModelOwnedIdentity(params.body)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function renderUnitGuideReply(params: { body: string; position: string; unit: number; kind: "grammar" | "vocabulary" }) {
  const title = unitTitle(params.unit);
  const label = params.kind === "grammar" ? "Grammar guide" : "Vocabulary guide";
  return readableMarkdownPunctuation([params.position, "", `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""} — ${label}`)}`, "", stripModelOwnedIdentity(params.body)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
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

function modelResponseNeedsRetry(data: any, reply: string) {
  const reason = data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "";
  return data?.status === "incomplete" || reason === "max_output_tokens" || !reply.trim();
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
  if (process.env.NODE_ENV === "development" && (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN)) {
    console.warn("[coach] using development-only learner context; English OS read/write is unavailable");
    return {
      ok: true,
      learnerId: email,
      localValidationMode: true,
      user: { "Learner ID": email },
      missionControl: {},
    };
  }
  const data = await callEnglishOSAction("getLearnerContext", { userEmail: email, learnerId: email });
  if (!data?.ok) throw new Error(data?.error || "Unable to read learner context.");
  return data;
}

async function buildClassInput(params: {
  message: string;
  learnerContext: any;
  classContent: any;
  classPack: string;
  filename: string;
  conversationHistory: CoachMessage[];
}) {
  const identity = classIdentity(params.classPack);
  const explicitCoordinates = hasExplicitClassCoordinates(params.message);
  const explicitClassRule = explicitCoordinates
    ? [
        "Explicit class request wins:",
        "- The learner explicitly asked for a unit and class number. That request is authoritative for this turn.",
        "- Teach the requested unit and class even if the saved English OS position is different.",
        "- Use the saved position only as background context, not as a permission gate.",
        "- Do not ask for confirmation, do not offer \"continue my current class\" alternatives, and do not switch back to the saved/current class.",
      ].join("\n")
    : "";
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.class.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
        explicitClassRule,
        openingSectionInstruction: openingSectionInstruction(identity.sections),
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.class.user", {
        message: params.message,
        filename: params.filename,
        classPack: params.classPack.slice(0, 18000),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        classContent: JSON.stringify(params.classContent).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 2500),
      }),
    },
  ];
}

async function buildGeneralInput(context: any, message: string, conversationHistory: CoachMessage[]) {
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.general.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.general.user", {
        learnerContext: JSON.stringify(context).slice(0, 7000),
        conversationHistory: JSON.stringify(conversationHistory).slice(0, 2500),
        message,
      }),
    },
  ];
}

async function buildReviewInput(params: {
  message: string;
  learnerContext: any;
  unit: number;
  contracts: ReturnType<typeof loadUnitTeachingContracts>;
  conversationHistory: CoachMessage[];
}) {
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.review.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.review.user", {
        message: params.message,
        unit: params.unit,
        contracts: params.contracts.map((item) => `CLASS ${item.localClass}\n${item.contract}`).join("\n\n"),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 2500),
      }),
    },
  ];
}

async function buildVisualVocabularyInput(context: any, message: string, image: CoachImageAttachment, conversationHistory: CoachMessage[]) {
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.visualVocabulary.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
      }),
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: await renderServerPrompt("coachRoute.visualVocabulary.user", {
            message: message || "Analyze this image and help me learn vocabulary from it.",
            learnerContext: JSON.stringify(context).slice(0, 3500),
            conversationHistory: JSON.stringify(conversationHistory).slice(0, 1600),
            imageName: image.name || "learner-photo",
            imageMimeType: image.mimeType || "image/jpeg",
          }),
        },
        {
          type: "input_image",
          image_url: image.dataUrl,
        },
      ],
    },
  ];
}
async function buildUnitGuideInput(params: {
  message: string;
  learnerContext: any;
  unit: number;
  kind: "grammar" | "vocabulary";
  contracts: ReturnType<typeof loadUnitTeachingContracts>;
  conversationHistory: CoachMessage[];
}) {
  const guideFocus =
    params.kind === "grammar"
      ? "grammar structures, usage rules, Spanish explanations for difficult transfer points, common mistakes, and a short practice check"
      : "high-value chunks, collocations, Spanish meanings, English examples, pronunciation tips, and a short practice check";

  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.unitGuide.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
        guideKind: params.kind,
        guideFocus,
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.unitGuide.user", {
        message: params.message,
        unit: params.unit,
        guideKind: params.kind,
        contracts: params.contracts.map((item) => `CLASS ${item.localClass}\n${item.contract}`).join("\n\n"),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 2500),
      }),
    },
  ];
}

async function callCoachModel(input: any[], maxOutputTokens = OPENAI_COACH_MAX_OUTPUT_TOKENS) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_COACH_MODEL, input, max_output_tokens: maxOutputTokens }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
  return data;
}

async function callCompleteCoachModel(input: any[]) {
  let data = await callCoachModel(input);
  let reply = getOutputText(data);

  if (modelResponseNeedsRetry(data, reply)) {
    console.warn("[coach] incomplete model response; retrying", {
      status: data?.status || "unknown",
      reason: data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "empty_output",
      outputTokens: usage(data).outputTokens,
      retryMaxOutputTokens: OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS,
    });
    data = await callCoachModel(input, OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS);
    reply = getOutputText(data);
  }

  assertCompleteModelResponse(data, reply);
  return { data, reply };
}

export async function coachPost(request: Request) {
  const identity = await getApiLearnerIdentity(request);
  if (!identity.authenticated) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const email = identity.email;
  if (!email) return NextResponse.json({ ok: false, error: "No email found for current user." }, { status: 400 });

  const body = (await request.json()) as CoachRequest;
  const message = String(body.message || "").trim();
  const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-12) : [];
  const image = body.image?.dataUrl ? body.image : null;
  if (!message && !image) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });

  const context = await getLearnerContext(email);
  const user = context?.user || {};
  const learnerId = user["Learner ID"] || context?.learnerId || email;
  const currentUnit = user["Current Unit"] || context?.currentUnit || "";
  const currentLesson = user["Current Lesson"] || context?.currentLesson || "";
  const sessionFor = (input: Parameters<typeof createCoachSessionContract>[0]) =>
    createCoachSessionContract({
      savedUnit: currentUnit,
      savedLesson: currentLesson,
      source: "english_os",
      ...input,
    });

  if (image) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(image.dataUrl)) {
      return NextResponse.json({ ok: false, error: "Unsupported image format." }, { status: 400 });
    }

    const openaiData = await callCoachModel(
      await buildVisualVocabularyInput(context, message || "Analyze this image for English vocabulary.", image, conversationHistory),
      2200
    );
    const reply = sanitizeLearnerFacingReply(getOutputText(openaiData));
    const u = usage(openaiData);
    const session = sessionFor({ mode: "conversation", activeUnit: currentUnit, resourcesUnit: currentUnit });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      source: "Ephemeral Visual Vocabulary Analysis",
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isGiveClassQuestion(message)) {
    let target = resolveClassTargetFromMessage(message, currentUnit, context);
    let activeClassContent: any = null;
    if (target.needsCurrentClassLookup) {
      try {
        activeClassContent = await callEnglishOSAction("getCurrentClassContent", { userEmail: email, learnerId });
        target = mergeClassTargetWithPayload(target, activeClassContent);
      } catch {
        activeClassContent = null;
      }
    }
    const { unit, localClass, globalClass } = target;
    if (!unit || !localClass) {
      const savedUnit = unit ? `Unit ${unit}` : "tu unidad actual";
      const session = sessionFor({ mode: "class", activeUnit: unit, activeClassNumber: null, resourcesUnit: unit });
      return NextResponse.json({
        ok: true,
        agent: "coach",
        reply: [
          `Encontré ${savedUnit}, pero no tengo un número de clase activo confiable.`,
          "",
          "Para no inventar **Class 1** ni mezclar una lección guardada con otra clase, dime exactamente cuál quieres abrir.",
          "",
          "Puedes escribir, por ejemplo: **Dame la clase 2 de la unidad 4**.",
        ].join("\n"),
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        source: "Current Class Clarification",
      });
    }

    const classContent = await callEnglishOSAction("getClassContent", {
      unit: String(unit),
      classNumber: String(globalClass),
      userEmail: email,
      learnerId,
    }).catch(() => activeClassContent);

    const { filename, content } = loadClassPack(unit, localClass);
    if (!content) {
      return NextResponse.json({ ok: false, error: `Missing local class pack: ${filename}` }, { status: 500 });
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildClassInput({ message, learnerContext: context, classContent, classPack: content, filename, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const identity = classIdentity(content);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, ""),
      requestedUnit: unit,
      requestedClass: localClass,
      explicitClassRequest: target.explicitClassRequest,
    });
    const reply = renderClassReply({ body: modelBody, position, identity, unit, localClass });
    const u = usage(openaiData);
    const session = sessionFor({
      mode: "class",
      activeUnit: unit,
      activeClassNumber: localClass,
      lessonTitle: identity.lessonTitle,
      resourcesUnit: unit,
    });

    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      activeClass: legacyActiveClass(session),
      source: "Local Class Pack + Pedagogy Prompt",
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isReviewQuestion(message)) {
    const unit = resolveUnitTarget(message, currentUnit);
    if (!unit) return NextResponse.json({ ok: false, error: "I need a unit number for the review." }, { status: 400 });

    const contracts = loadUnitTeachingContracts(unit);
    const missing = contracts.filter((item) => !item.contract);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing teaching contracts for unit ${unit}: ${missing.map((item) => item.localClass).join(", ")}` },
        { status: 500 }
      );
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildReviewInput({ message, learnerContext: context, unit, contracts, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, ""),
      requestedUnit: unit,
      review: true,
    });
    const reply = renderReviewReply({ body: modelBody, position, unit });
    const u = usage(openaiData);
    const session = sessionFor({ mode: "review", activeUnit: unit, resourcesUnit: unit });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      source: "Seven Local Teaching Contracts + Review Pedagogy Prompt",
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  const guideKind = unitGuideKind(message);
  if (guideKind) {
    const unit = resolveUnitTarget(message, currentUnit);
    if (!unit) return NextResponse.json({ ok: false, error: "I need a unit number for the guide." }, { status: 400 });

    const contracts = loadUnitTeachingContracts(unit);
    const missing = contracts.filter((item) => !item.contract);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing teaching contracts for unit ${unit}: ${missing.map((item) => item.localClass).join(", ")}` },
        { status: 500 }
      );
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildUnitGuideInput({ message, learnerContext: context, unit, kind: guideKind, contracts, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, ""),
      requestedUnit: unit,
      guideKind,
    });
    const reply = renderUnitGuideReply({ body: modelBody, position, unit, kind: guideKind });
    const u = usage(openaiData);
    const session = sessionFor({ mode: "guide", activeUnit: unit, resourcesUnit: unit });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      source: `Seven Local Teaching Contracts + ${guideKind} Guide Prompt`,
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  const openaiData = await callCoachModel(await buildGeneralInput(context, message, conversationHistory));
  const reply = sanitizeLearnerFacingReply(getOutputText(openaiData));
  const u = usage(openaiData);
  const session = sessionFor({ mode: "conversation", activeUnit: currentUnit, resourcesUnit: currentUnit });
  return NextResponse.json({
    ok: true,
    agent: "coach",
    reply,
    session,
    usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
  });
}

export async function coachPostSafe(request: Request) {
  try {
    return await coachPost(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown coach error";
    console.error("[coach] request failed", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
