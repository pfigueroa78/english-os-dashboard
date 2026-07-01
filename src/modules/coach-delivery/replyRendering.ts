import { unitTitle, type ClassIdentity } from "@/modules/coach-delivery/teachingContracts";
import {
  classSections,
  guidedOpeningFallback,
  lessonBlockRoadmap,
} from "@/modules/coach-delivery/pedagogicalDeliveryPolicy";

const FORBIDDEN_METADATA_MARKERS = [
  "Clase actual / contenido de clase",
  "viewing_current_class",
  "Extract exact",
  "Extract vocabulary",
  "Use the target language from the indexed page range",
  "anchored to Student Book pages",
  "Recycle confirmed",
  "confirmed Unit",
  "Use only target structures confirmed",
  "learner-safe practice",
  "indexed Unit",
];

const FORBIDDEN_METADATA_PATTERNS = [
  /\bclass pack\b/i,
  /\blocal class\b/i,
  /\bclass \d+\s*\/\s*class \d+ locally\b/i,
  /unit-\d{2}-local-class-/i,
  /CLASS_PACK_UNIT_/i,
];

export function learnerName(context: any, fallback = "") {
  const user = context?.user || {};
  return String(user.Name || user.name || user["Full Name"] || context?.name || fallback || "").trim();
}

export function learnerPositionLine(params: {
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

export function stripModelOwnedIdentity(reply: string) {
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

export function sanitizeLearnerFacingReply(reply: string) {
  return String(reply || "")
    .split("\n")
    .filter((line) => {
      const clean = line.replace(/[*#]/g, "").trim();
      return !/\b(recycle confirmed|confirmed unit|use only target structures confirmed|learner-safe practice|indexed unit|unverified student book|do not invent missing|do not infer unindexed)\b/i.test(clean);
    })
    .join("\n")
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

export function ensureTerminalPeriod(value: string) {
  const text = String(value || "").trim();
  if (!text || hasTerminalPunctuation(text)) return text;
  return `${text}.`;
}

export function readableMarkdownPunctuation(reply: string) {
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
    .replace(/^The class is not grammar-centered;\s*it combines\s*/i, "")
    .replace(/^This class is not grammar-centered;\s*(?:it focuses on|its real focus is|the real focus is|the main skill focus is)\s*/i, "")
    .replace(/^This class is not grammar-centered;\s*it combines\s*/i, "")
    .replace(/^Not grammar-centered;\s*(?:the visible skill focus is|the skill focus is)\s*/i, "")
    .replace(/^The class is grammar-centered,\s*with\s*/i, "")
    .replace(/^This class is grammar-centered,\s*with\s*/i, "")
    .replace(/^The class is grammar-centered,\s*/i, "")
    .replace(/^This class is grammar-centered,\s*/i, "")
    .replace(/\.$/, "")
    .trim();
}

function hasExplicitOpeningTask(text: string) {
  return /(?:\byour turn\b|\bnow your turn\b|\banswer (?:in english|these|this)|\bwrite (?:two|2|one|1|a|your)|\btell me\b|\bcomplete (?:these|this)|\btry\b|^\s*\d+\.\s+\S)/im.test(text);
}

function learnerFriendlyLessonFlow(identity: ClassIdentity, localClass?: number | null) {
  const learningBlocks = lessonBlockRoadmap(identity, localClass);
  const hasLaterTeachingBlock = learningBlocks
    .slice(1)
    .some((block) => !/evaluation gate/i.test(block));

  return [
    "Primero verás la explicación, ejemplos y una práctica guiada.",
    hasLaterTeachingBlock
      ? "Después continuaremos con una producción más completa según tu respuesta."
      : "Después harás una sola evaluación integrada.",
  ].join(" ");
}

function activeSectionList(sectionList: string) {
  return classSections(sectionList);
}

function lessonRoadmap(identity: ClassIdentity, localClass?: number | null) {
  const learningBlocks = lessonBlockRoadmap(identity, localClass);
  const laterBlocks = learningBlocks
    .slice(1)
    .filter((block) => !/evaluation gate/i.test(block));
  return [
    "Primero verás la explicación, ejemplos y una práctica guiada.",
    laterBlocks.length ? `Luego seguiremos con ${laterBlocks.join(" -> ")} según tu respuesta.` : "Luego avanzaremos según tu respuesta.",
  ].filter(Boolean).join(" ");

  const sections = activeSectionList(identity.sections);
  const firstSection = sections[0] || identity.lessonTitle || "Starting point";
  const hasVideoStages = sections.some((section) => /before watching|while watching|after watching/i.test(section));
  const sectionSteps = sections.length === 1 && /video/i.test(firstSection)
    ? ["Before watching", "While watching", "After watching"]
    : hasVideoStages
      ? sections.filter((section) => !/^video class$/i.test(section))
      : sections;
  const steps = [...sectionSteps, "Evaluation gate"];
  const current = steps[0] || firstSection;
  const next = steps.slice(1).join(" → ");
  return [
    `Primero trabajaremos: **${current}**.`,
    next ? `Después: ${next}.` : "",
  ].filter(Boolean).join(" ");
}

function evaluationModeLine(localClass: number) {
  if (localClass !== 7) return "";
  return "Checkpoint de unidad: esta clase cierra la unidad, así que integraremos gramática, vocabulario y producción de forma gradual.";
}

export function ensureMinimumOpeningTask(reply: string, identity: ClassIdentity) {
  const text = String(reply || "").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 45 && hasExplicitOpeningTask(text)) return text;

  const firstSection = identity.sections.split("+")[0]?.trim() || identity.lessonTitle || "Starting point";
  if (/video|before watching/i.test(firstSection)) {
    return [
      text,
      "",
      "Let's start with a short prediction before watching. Think about the lesson topic and answer in English:",
      "",
      "1. What do you think this video will show?",
      "2. Which Unit language do you expect to use in your answer?",
      "",
      "Write two short sentences. I'll use your answer to continue with the next step.",
    ].filter(Boolean).join("\n");
  }
  return [
    text,
    "",
    "Let's start with one small step. Answer in English with two short sentences about the lesson topic. I'll continue from your answer.",
  ].filter(Boolean).join("\n");
}

export function ensureRichOpeningTask(reply: string, identity: ClassIdentity) {
  const text = String(reply || "").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 45 && hasExplicitOpeningTask(text)) return text;

  const firstSection = identity.sections.split("+")[0]?.trim() || identity.lessonTitle || "Starting point";
  if (/video|before watching/i.test(firstSection)) {
    return [
      text,
      "",
      "## Video Class - Before watching",
      "",
      "We will not invent the video transcript. First, we prepare your ideas so you can watch or discuss the video with a clear purpose.",
      "",
      "### Model answers.",
      "",
      "> I think the video will show different daily routines and how people manage their energy.",
      "> I expect to use Unit language like morning person, night owl, sleep habits, and productivity.",
      "",
      "> The video might compare people who work better early with people who feel more creative at night.",
      "> I can use time clauses such as after I wake up, before I start work, and whenever I feel tired.",
      "",
      "### Your turn.",
      "",
      "1. What do you think this video will show?",
      "2. Which useful Unit words or time clauses can you use to talk about it?",
      "",
      "Write two short sentences. I will correct your answer and then we will continue with the next video step.",
    ].filter(Boolean).join("\n");
  }

  return [
    text,
    "",
    "## Starting point",
    "",
    "### Model answers.",
    "",
    "> I can explain my idea with a short example.",
    "> I can connect the lesson topic to my work or daily routine.",
    "",
    "### Your turn.",
    "",
    "Answer in English with two short sentences about the lesson topic. I will continue from your answer.",
  ].filter(Boolean).join("\n");
}

export function renderClassReply(params: {
  body: string;
  position: string;
  identity: ClassIdentity;
  unit: number;
  localClass: number;
  displayClass?: number | null;
}) {
  const identity = params.identity;
  const title = unitTitle(params.unit);
  const displayLesson = cleanDisplayLesson(identity.lessonTitle || identity.sections.split("+")[0]?.trim() || "Class session");
  const formattedSkillFocus = learnerFriendlyFocus(identity.skillFocus.split(",").map((item) => item.trim()).filter(Boolean).join(", "));
  const teachingBody = guidedOpeningFallback(
    stripClassConfirmationDetours(stripPrematureClassClosure(stripModelOwnedIdentity(params.body))),
    identity,
    params.localClass,
  );
  const position = learnerLocalClassPosition(params.position, params.unit, params.localClass, displayLesson);
  const reference = [
    `class ${params.localClass}`,
    displayLesson,
  ].filter(Boolean).join(" · ");
  const header = [
    `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""}`)}`,
    `Hoy trabajaremos **${reference}**.`,
    "",
    learnerFriendlyLessonFlow(identity, params.localClass),
    evaluationModeLine(params.localClass),
    "",
    formattedSkillFocus
      ? `Trabajaremos especialmente: **${formattedSkillFocus}**.`
      : "Iremos paso a paso.",
  ].filter(Boolean);

  return readableMarkdownPunctuation(sanitizeLearnerFacingReply([position, "", ...header, "", teachingBody]
    .join("\n")
    .trim()));
}

function learnerLocalClassPosition(position: string, unit: number, localClass: number, lessonTitle: string) {
  const text = String(position || "").trim();
  const cleanLesson = cleanDisplayLesson(lessonTitle);
  const localTarget = `Unit ${unit}, Class ${localClass}${cleanLesson ? `: ${cleanLesson}` : ""}`;
  if (!text) return `Trabajaremos con **${localTarget}**.`;
  return text
    .replace(new RegExp(`Unit\\s+${unit}\\s*,\\s*Class\\s+\\d+`, "i"), localTarget)
    .replace(new RegExp(`Unit\\s+${unit}\\s+Class\\s+\\d+`, "i"), localTarget)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDisplayLesson(value: string) {
  return String(value || "").replace(/[.!?]+$/g, "").trim();
}

export function renderReviewReply(params: { body: string; position: string; unit: number }) {
  const title = unitTitle(params.unit);
  return readableMarkdownPunctuation([params.position, "", `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""} — Strategic review`)}`, "", stripModelOwnedIdentity(params.body)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

export function renderUnitGuideReply(params: { body: string; position: string; unit: number; kind: "grammar" | "vocabulary" }) {
  const title = unitTitle(params.unit);
  const label = params.kind === "grammar" ? "Grammar guide" : "Vocabulary guide";
  return readableMarkdownPunctuation([params.position, "", `# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""} — ${label}`)}`, "", stripModelOwnedIdentity(params.body)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

export function assertNoMetadataFallback(reply: string) {
  const found = FORBIDDEN_METADATA_MARKERS.find((marker) => reply.includes(marker));
  if (found) throw new Error(`Unsafe class reply contains metadata marker: ${found}`);
  const pattern = FORBIDDEN_METADATA_PATTERNS.find((candidate) => candidate.test(reply));
  if (pattern) throw new Error(`Unsafe class reply contains internal planning language: ${pattern}`);
}
