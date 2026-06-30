import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";
import { buildTeachingContractV2, type TeachingContractV2 } from "@/modules/coach-delivery/teachingContractV2";
import type { PedagogicalRole } from "@/modules/coach-delivery/pedagogicalProfiles";
import lessonStepsConfig from "../../../knowledge/pedagogy/lesson-steps/default.json";

export type OpeningBlockPolicy = {
  kind: "video" | "checkpoint" | "guided_block";
  title: string;
  sections: string[];
  requiredSignals: string[];
  instruction: string;
};

const ROLE_KIND: Partial<Record<PedagogicalRole, OpeningBlockPolicy["kind"]>> = {
  video: "video",
  checkpoint: "checkpoint",
};

const ROADMAP_BY_KIND = (lessonStepsConfig as {
  roadmaps: Record<OpeningBlockPolicy["kind"] | "guided_block_without_production", string[]>;
}).roadmaps;

const POLICY_BY_KIND: Record<OpeningBlockPolicy["kind"], Omit<OpeningBlockPolicy, "sections">> = {
  video: {
    kind: "video",
    title: "Video preparation block",
    requiredSignals: ["Video Class", "Before watching", "model", "Your turn"],
    instruction: [
      "OPENING LEARNING BLOCK: Video preparation.",
      "Do not behave like a question-only evaluator.",
      "First explain the video purpose, give useful Unit language, and provide one or two model answers.",
      "Then ask one compact prediction/preparation task.",
      "Do not invent a transcript, scenes, or answer key.",
    ].join(" "),
  },
  checkpoint: {
    kind: "checkpoint",
    title: "Unit checkpoint briefing",
    requiredSignals: ["checkpoint", "rubric", "model", "Your turn"],
    instruction: [
      "OPENING LEARNING BLOCK: Unit checkpoint briefing.",
      "Do not start by asking questions immediately.",
      "First summarize what the checkpoint evaluates, show the approval criteria, and give a compact model.",
      "Then ask one integrated checkpoint response.",
    ].join(" "),
  },
  guided_block: {
    kind: "guided_block",
    title: "Learn & practice block",
    requiredSignals: ["Warm-up", "Teacher explanation", "Examples", "Controlled practice"],
    instruction: [
      "OPENING LEARNING BLOCK: Learn & practice.",
      "Teach the first learning block, not only the first heading.",
      "Use this rhythm: brief situation -> key language or grammar -> vocabulary/useful chunks -> controlled practice -> one integrated learner task.",
      "Ask only once at the end of the block.",
      "Do not include the final evaluation gate, approval, recap, score, or session log yet.",
    ].join(" "),
  },
};

type RenderSection = {
  heading: string;
  lines: string[];
};

export function classSections(sectionList: string) {
  return String(sectionList || "")
    .split("+")
    .map((section) => section.trim())
    .filter(Boolean);
}

export function openingBlockPolicy(identity: ClassIdentity, _localClass?: number | null): OpeningBlockPolicy {
  const teaching = buildTeachingContractV2(identity);
  const kind = ROLE_KIND[teaching.pedagogicalRole] || "guided_block";
  const base = POLICY_BY_KIND[kind];
  return {
    ...base,
    sections: selectOpeningSections(teaching, kind),
  };
}

export function lessonBlockRoadmap(identity: ClassIdentity, localClass?: number | null) {
  const policy = openingBlockPolicy(identity, localClass);
  const sections = classSections(identity.sections);
  const hasProduction = sections.some((section) => containsAny(section, ["speaking", "discussion", "role play", "writing", "conversation"]));
  return policy.kind === "guided_block" && !hasProduction
    ? ROADMAP_BY_KIND.guided_block_without_production
    : ROADMAP_BY_KIND[policy.kind];
}

export function hasSufficientOpeningBlock(reply: string, identity: ClassIdentity, localClass?: number | null) {
  const text = String(reply || "");
  const policy = openingBlockPolicy(identity, localClass);
  const normalized = normalize(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const signalHits = policy.requiredSignals.filter((signal) => normalized.includes(normalize(signal))).length;

  return wordCount >= 110
    && hasSingleClearLearnerTask(text)
    && signalHits >= 2
    && policySpecificEvidence(policy.kind, normalized);
}

export function guidedOpeningFallback(reply: string, identity: ClassIdentity, localClass?: number | null) {
  if (hasSufficientOpeningBlock(reply, identity, localClass)) return String(reply || "").trim();
  return renderOpeningFallback(identity, openingBlockPolicy(identity, localClass));
}

export function openingLearningBlockInstruction(identity: ClassIdentity, localClass?: number | null) {
  return openingBlockPolicy(identity, localClass).instruction;
}

function renderOpeningFallback(identity: ClassIdentity, policy: OpeningBlockPolicy) {
  const teaching = buildTeachingContractV2(identity);
  const sections = openingSections(policy, teaching);
  return sections
    .map((section) => [`## ${section.heading}`, "", ...section.lines].join("\n"))
    .join("\n\n");
}

function openingSections(policy: OpeningBlockPolicy, teaching: TeachingContractV2): RenderSection[] {
  const common = commonLearningSections(teaching);
  const variants: Record<OpeningBlockPolicy["kind"], RenderSection[]> = {
    video: [
      {
        heading: "Video Class - Before watching",
        lines: [
          "First, we prepare your mind for the video. We will not invent the video transcript.",
          "",
          ...common.language,
          "",
          ...common.examples,
          "",
          "Your turn: write 2-3 sentences in English. Predict the main idea and include one useful word, chunk, or structure from this class.",
        ],
      },
    ],
    checkpoint: [
      {
        heading: "Unit checkpoint briefing",
        lines: [
          "This checkpoint checks whether you can use the unit language in a real answer, not just recognize it.",
          "",
          ...common.criteria,
          "",
          ...common.language,
          "",
          ...common.examples,
          "",
          "Your turn: write 4-6 short sentences in English. Show the grammar, vocabulary, and communication skill from this unit.",
        ],
      },
    ],
    guided_block: [
      {
        heading: teaching.presentation.warmupHeading,
        lines: [
          teaching.coreConcept,
          "We will follow a simple teaching path: first notice the language, then practice it safely, and finally use it in your own answer.",
        ],
      },
      {
        heading: "Key vocabulary and chunks",
        lines: common.language,
      },
      {
        heading: teaching.presentation.explanationHeading,
        lines: [
          "Use the target language to communicate one clear idea, one reason, and one example.",
          ...common.spanishSupport,
          "",
          ...common.examples,
        ].filter(Boolean),
      },
      {
        heading: "Controlled practice",
        lines: common.practice,
      },
      {
        heading: teaching.presentation.productionHeading,
        lines: [
          learnerTask(teaching.guidedProduction),
          "",
          ...common.criteria,
        ],
      },
    ],
  };
  return variants[policy.kind];
}

function commonLearningSections(teaching: TeachingContractV2) {
  return {
    language: renderLanguage(teaching),
    spanishSupport: renderSpanishSupport(teaching),
    examples: renderExamples(teaching),
    practice: renderPractice(teaching),
    criteria: renderCriteria(teaching),
  };
}

function renderLanguage(teaching: TeachingContractV2) {
  const items = [
    ...teaching.targetLanguage.patterns,
    ...teaching.targetLanguage.vocabulary,
    ...teaching.targetLanguage.functions,
  ].filter(Boolean).slice(0, 10);
  const rendered = items.length ? items.map((item) => `- **${item}**`) : ["- **useful language from this class**"];
  return ["Useful patterns and chunks:", "", ...rendered];
}

function renderSpanishSupport(teaching: TeachingContractV2) {
  return teaching.spanishSupport.length
    ? ["Spanish support:", "", ...teaching.spanishSupport.map((item) => `- ${item}`)]
    : [];
}

function renderExamples(teaching: TeachingContractV2) {
  const examples = teaching.modelExamples.length
    ? teaching.modelExamples
    : [
        "A strong answer gives one clear idea, one reason, and one simple example.",
        "Use one useful chunk from the class and connect it to your own experience.",
      ];
  return ["Model examples / Model dialogue / Model paragraph:", "", ...examples.slice(0, 4).map((item) => `> ${item}`)];
}

function renderPractice(teaching: TeachingContractV2) {
  const items = teaching.controlledPractice.length
    ? teaching.controlledPractice.map((item, index) => `${index + 1}. ${item}`)
    : ["1. Write one sentence with the target pattern.", "2. Add one useful chunk from the lesson."];
  return ["Complete this mini-dialogue or controlled item:", "", ...items];
}

function renderCriteria(teaching: TeachingContractV2) {
  return [
    "To approve this class later, your final answer should:",
    "",
    ...teaching.evaluationCriteria.slice(0, 4).map((item) => `- ${item}`),
  ];
}

function learnerTask(task: string) {
  const value = String(task || "").trim() || "write 3-5 sentences in English using the target language.";
  return `Your turn: ${value.replace(/^write\b/i, "write")}`;
}

function selectOpeningSections(teaching: TeachingContractV2, kind: OpeningBlockPolicy["kind"]) {
  const sections = teaching.bookAnchor.sections;
  const selected = kind === "video"
    ? sections.filter((section) => !sameText(section, "Video Class")).slice(0, 2)
    : sections.slice(0, kind === "checkpoint" ? 3 : 3);
  return selected.length ? selected : [teaching.bookAnchor.lessonTitle || "Starting point"];
}

function hasSingleClearLearnerTask(text: string) {
  const normalized = normalize(text);
  const signals = ["your turn", "now your turn", "answer in english", "write", "complete", "try"];
  const hits = signals.filter((signal) => normalized.includes(signal)).length;
  return hits >= 1 && hits <= 4;
}

function policySpecificEvidence(kind: OpeningBlockPolicy["kind"], normalized: string) {
  const requirements: Record<OpeningBlockPolicy["kind"], string[]> = {
    video: ["before watching", "prediction", "video"],
    checkpoint: ["criteria", "rubric", "approve", "checkpoint"],
    guided_block: ["teacher explanation", "controlled practice", "vocabulary", "key vocabulary", "useful chunks"],
  };
  const required = requirements[kind];
  return required.filter((signal) => normalized.includes(signal)).length >= (kind === "guided_block" ? 2 : 1);
}

function containsAny(value: string, signals: string[]) {
  const normalized = normalize(value);
  return signals.some((signal) => normalized.includes(normalize(signal)));
}

function sameText(left: string, right: string) {
  return normalize(left) === normalize(right);
}

function normalize(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}
