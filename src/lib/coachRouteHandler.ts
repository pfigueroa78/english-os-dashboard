import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ENGLISH_OS_COACH_BEHAVIOR_PROMPT } from "@/lib/englishOsCoachPrompt";
import { PASSAGES_TEACHER_STYLE_GUIDANCE } from "@/lib/passagesTeacherStyle";
import {
  extractRequestedClassNumber,
  extractRequestedUnitNumber,
  isGiveClassQuestion,
  normalizeCoachMessage as normalize,
} from "@/lib/coachIntent";
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
  const n = normalize(message);
  return (n.includes("repaso") || n.includes("repasar") || n.includes("review")) && (n.includes("unidad") || n.includes("unit"));
}

function unitGuideKind(message: string): "grammar" | "vocabulary" | null {
  const n = normalize(message);
  const asksGuide = n.includes("guia") || n.includes("guide");
  const asksUnit = n.includes("unidad") || n.includes("unit");
  if (!asksGuide || !asksUnit) return null;
  if (n.includes("gramatica") || n.includes("grammar")) return "grammar";
  if (n.includes("vocabulario") || n.includes("vocabulary")) return "vocabulary";
  return null;
}

function firstNumericValue(...values: unknown[]) {
  for (const value of values) {
    const match = String(value || "").match(/\d{1,2}/);
    if (match?.[0]) return Number(match[0]);
  }
  return null;
}

function localClassFromAnyClassNumber(value: number | null, unit: number | null) {
  if (!value) return null;
  if (value >= 1 && value <= 7) return value;
  if (unit && value > 7) {
    const local = value - (unit - 1) * 7;
    if (local >= 1 && local <= 7) return local;
  }
  return null;
}

function resolveCurrentLocalClass(context: any, unit: number | null) {
  const user = context?.user || {};
  const recommended = context?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || {};
  const learningState = context?.learningState || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || {};
  const classIndex = context?.currentClassIndex || context?.classContent?.currentClassIndex || {};
  const rawClass = firstNumericValue(
    user["Current Class"],
    user.CurrentClass,
    user["Class"],
    recommended.currentClass,
    recommended.classNumber,
    recommended.globalClass,
    current.currentClass,
    current.classNumber,
    current.globalClass,
    learningState.currentClass,
    learningState.classNumber,
    learningState.globalClass,
    missionControl.currentClass,
    missionControl.classNumber,
    missionControl.globalClass,
    classIndex.classNumber,
    classIndex.localClass,
    classIndex.globalClass,
    user["Current Position"],
    context?.currentLesson,
    missionControl.currentLesson,
  );
  return localClassFromAnyClassNumber(rawClass, unit);
}

function classCoordinates(message: string, fallbackUnit?: string, context?: any) {
  const unit = extractRequestedUnitNumber(message) || Number(String(fallbackUnit || "").match(/\d{1,2}/)?.[0] || 0) || null;
  const explicitClass = extractRequestedClassNumber(message);
  const localClass = explicitClass || resolveCurrentLocalClass(context, unit);
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
}) {
  const user = params.context?.user || {};
  const currentUnit = user["Current Unit"] || params.context?.currentUnit || "";
  const currentLesson = user["Current Lesson"] || params.context?.currentLesson || "";
  const greeting = params.name ? `${params.name}, ` : "";
  const savedPosition = learnerFriendlySavedPosition([currentUnit, currentLesson].filter(Boolean).join(" — "));
  const target = params.guideKind
    ? `Unit ${params.requestedUnit} ${params.guideKind === "grammar" ? "grammar guide" : "vocabulary guide"}`
    : params.review
      ? `Unit ${params.requestedUnit} review`
      : `Unit ${params.requestedUnit}, Class ${params.requestedClass}`;

  if (savedPosition) {
    return `${greeting}I found your saved position in English OS: **${savedPosition}**.\n\nYou asked for **${target}**, so we’ll work there now.`;
  }
  return `${greeting}we’ll work on **${target}** now.`;
}

function stripModelOwnedIdentity(reply: string) {
  return String(reply || "")
    .split("\n")
    .filter((line) => {
      const clean = line.replace(/[*#]/g, "").trim();
      return !/^(Unit \d+\b|Class:|Global Class|Lesson:|Book pages:|PDF pages:|Class sections:|Main focus:|Grammar focus:|Language support:|Vocabulary focus:)/i.test(clean);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeLearnerFacingReply(reply: string) {
  return String(reply || "")
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
  const teachingBody = limitToOpeningClassTurn(stripModelOwnedIdentity(params.body), identity.sections);
  const reference = [
    `class ${params.localClass}`,
    displayLesson,
  ].filter(Boolean).join(" · ");
  const header = [
    `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""}`)}`,
    `Current target: **${reference}**.`,
    "",
    formattedSkillFocus
      ? `Focus: **${formattedSkillFocus}**. We’ll work one step at a time.`
      : "We’ll work one step at a time.",
    "",
    identity.sections ? `First micro-step: **${identity.sections.split("+")[0]?.trim() || displayLesson}**.` : "",
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

function buildClassInput(params: {
  message: string;
  learnerContext: any;
  classContent: any;
  classPack: string;
  filename: string;
  conversationHistory: CoachMessage[];
}) {
  const identity = classIdentity(params.classPack);
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
- This response is the opening turn of a teacher-led class, not the entire class transcript.
- Use this strategic opening architecture: current target -> why this matters -> first micro-step -> one learner task.
- Give the learning objective in one short sentence, the communication mission in one short sentence, and only the first active teaching section. Explain briefly, give no more than two examples, ask one compact learner task, and stop for the learner's answer.
- Do not teach the second or later active section yet. Do not include the evaluation gate, recap, achievement, weakness, correction priority, next action, approval, or session-log language in this opening turn.
- Continue with the next active section only after the learner answers. Present the evaluation gate only after the learner has practised the active sections.
- If the source is incomplete, say what is missing instead of inventing.
- Build one continuous teaching sequence. Each active section must reuse language or learner output from the previous section.
- Distinguish the complete lesson title from activity/subsection headings.
- Do not invent or attribute an audio transcript or answer key to people named in the source.
- The application renders learner position and lesson identity. Do not write the learner-position paragraph, Unit/Class header, Global Class, lesson title, pages, class sections, main focus, language support, or vocabulary-focus metadata.
- Start with the learning objective, then the communication mission, then the exact active teaching sections.
- Keep this opening turn under 280 words and avoid nested generic wrappers.
- Teach interactively: explain briefly, model, ask the learner to produce, and make the final instruction unmistakable.
- Every grammar form and vocabulary item taught must be supported by the active teaching contract or visible source. Do not broaden the lesson with adjacent language systems.
- Use English for teaching. Use brief Spanish support only for a genuinely difficult B1/B2 concept or a known transfer error.

${openingSectionInstruction(identity.sections)}
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
If recent conversation shows a class in progress, continue with only the next pedagogical step, ask one compact task, and wait. Do not repeat the class header or claim evaluation, approval, progress, or logging without learner evidence and a successful write action.
Learner-facing wording rule: never expose course-brand/source labels from the saved position. If the saved position contains a course-level source prefix before the unit, show only the unit. You may use the unit title, lesson, class, and mode only.
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

function buildVisualVocabularyInput(context: any, message: string, image: CoachImageAttachment, conversationHistory: CoachMessage[]) {
  return [
    {
      role: "system",
      content: `
${ENGLISH_OS_COACH_BEHAVIOR_PROMPT}

You are helping an English learner expand vocabulary from a photo.

Rules:
- Analyze only the image supplied in this request.
- Do not claim the image was stored, uploaded to Drive, or added to English OS history.
- Do not log progress or say "Session logged".
- Identify visible objects, people, places, actions, colors, materials, and useful everyday/professional chunks.
- Teach mostly in English, with brief Spanish support only for meaning.
- Be concise, useful, and interactive.
- If uncertain about an object, say "It looks like..." instead of asserting.
- End with a short speaking task using 5 selected words from the image.

Output format:
1. Quick image description
2. Vocabulary from the photo: English word/chunk — Spanish meaning — example sentence
3. Useful pronunciation or collocation notes
4. Your turn: ask the learner to describe the image in 3–4 sentences
      `.trim(),
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `
Learner request:
${message || "Analyze this image and help me learn vocabulary from it."}

Learner context:
${JSON.stringify(context).slice(0, 3500)}

Recent conversation:
${JSON.stringify(conversationHistory).slice(0, 1600)}

Image name: ${image.name || "learner-photo"}
Image MIME type: ${image.mimeType || "image/jpeg"}
          `.trim(),
        },
        {
          type: "input_image",
          image_url: image.dataUrl,
        },
      ],
    },
  ];
}

function buildUnitGuideInput(params: {
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
      content: `
${ENGLISH_OS_COACH_BEHAVIOR_PROMPT}

${PASSAGES_TEACHER_STYLE_GUIDANCE}

Hard rule for unit ${params.kind} guide:
- Build the guide from the seven supplied class teaching contracts, not from generic course knowledge.
- Do not ask the learner for the class index; it is supplied below.
- Do not mention Passages, Student Book, class packs, filenames, retrieval, metadata, or internal source limitations.
- Do not produce a long exhaustive dump. Prioritize what the learner can actually practise now.
- Organize the guide by 3-5 practical priorities across the unit, not by dumping all seven classes.
- Include ${guideFocus}.
- Keep the guide under 850 words and stop with a compact 4-item practice task.
- If a class has no relevant ${params.kind} item, skip it silently instead of saying it is missing.
- Use English for the guide with concise Spanish support for rules/meanings.
      `.trim(),
    },
    {
      role: "user",
      content: `
USER REQUEST:
${params.message}

ACTIVE GUIDE UNIT: ${params.unit}
GUIDE TYPE: ${params.kind}

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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
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

  if (image) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(image.dataUrl)) {
      return NextResponse.json({ ok: false, error: "Unsupported image format." }, { status: 400 });
    }

    const openaiData = await callCoachModel(
      buildVisualVocabularyInput(context, message || "Analyze this image for English vocabulary.", image, conversationHistory),
      2200
    );
    const reply = sanitizeLearnerFacingReply(getOutputText(openaiData));
    const u = usage(openaiData);
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      source: "Ephemeral Visual Vocabulary Analysis",
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isGiveClassQuestion(message)) {
    const { unit, localClass, globalClass } = classCoordinates(message, currentUnit, context);
    if (!unit || !localClass) {
      const savedUnit = unit ? `Unit ${unit}` : "tu unidad actual";
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
        activeUnit: unit || null,
        activeClass: null,
        source: "Current Class Clarification",
      });
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

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      buildClassInput({ message, learnerContext: context, classContent, classPack: content, filename, conversationHistory })
    );
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

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      buildReviewInput({ message, learnerContext: context, unit, contracts, conversationHistory })
    );
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

  const guideKind = unitGuideKind(message);
  if (guideKind) {
    const unit = extractRequestedUnitNumber(message) || Number(String(currentUnit).match(/\d{1,2}/)?.[0] || 0);
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
      buildUnitGuideInput({ message, learnerContext: context, unit, kind: guideKind, contracts, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, clerkUser?.firstName || ""),
      requestedUnit: unit,
      guideKind,
    });
    const reply = renderUnitGuideReply({ body: modelBody, position, unit, kind: guideKind });
    const u = usage(openaiData);
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      activeUnit: unit,
      source: `Seven Local Teaching Contracts + ${guideKind} Guide Prompt`,
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  const openaiData = await callCoachModel(buildGeneralInput(context, message, conversationHistory));
  const reply = sanitizeLearnerFacingReply(getOutputText(openaiData));
  const u = usage(openaiData);
  return NextResponse.json({
    ok: true,
    agent: "coach",
    reply,
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
