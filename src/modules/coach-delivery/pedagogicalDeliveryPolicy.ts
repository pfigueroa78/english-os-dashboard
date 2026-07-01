import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";
import { buildTeachingContractV2, type TeachingContractV2 } from "@/modules/coach-delivery/teachingContractV2";
import type { PedagogicalRole } from "@/modules/coach-delivery/pedagogicalProfiles";
import lessonStepsConfig from "../../../knowledge/pedagogy/lesson-steps/default.json";
import deliveryPolicyConfig from "../../../knowledge/pedagogy/delivery-policies/default.json";

export type OpeningBlockPolicy = {
  kind: "video" | "checkpoint" | "guided_block";
  title: string;
  sections: string[];
  requiredSignals: string[];
  instruction: string;
};

type TeacherOpeningViewModel = {
  sectionKind: TeacherSectionKind;
  activeSection: string;
  objective: string;
  mission: string;
  warmup: string;
  context: string;
  focus: string;
  patterns: string[];
  usefulLanguage: string[];
  teacherExplanation: string[];
  teacherInput: string[];
  noticing: string[];
  spanishSupport: string[];
  modelExamples: string[];
  controlledPractice: string[];
  learnerTask: string;
};

type TeacherSectionKind =
  | "grammar"
  | "vocabulary"
  | "listening"
  | "reading"
  | "writing"
  | "discussion"
  | "rolePlay"
  | "video"
  | "grammarPlus"
  | "checkpoint";

type DeliveryPolicyConfig = {
  openingRules: {
    minimumWords: number;
    maximumLearnerTasks: number;
    requiredSignals: string[];
    forbiddenPhrases: string[];
  };
  sectionKinds: Record<TeacherSectionKind, string[]>;
};

type SectionTeacherAdapter = {
  kind: TeacherSectionKind;
  canHandle(teaching: TeachingContractV2): boolean;
  create(teaching: TeachingContractV2): TeacherOpeningViewModel;
};

const ROLE_KIND: Partial<Record<PedagogicalRole, OpeningBlockPolicy["kind"]>> = {
  video: "video",
  checkpoint: "checkpoint",
};

const ROADMAP_BY_KIND = (lessonStepsConfig as {
  roadmaps: Record<OpeningBlockPolicy["kind"] | "guided_block_without_production", string[]>;
}).roadmaps;

const DELIVERY_POLICY = deliveryPolicyConfig as DeliveryPolicyConfig;

const POLICY_BY_KIND: Record<OpeningBlockPolicy["kind"], Omit<OpeningBlockPolicy, "sections">> = {
  video: {
    kind: "video",
    title: "Video preparation block",
    requiredSignals: ["Learning objective", "Communication mission", "Before watching", "Your turn"],
    instruction: [
      "OPENING LEARNING BLOCK: teacher-led video preparation.",
      "Teach the purpose of the video step, give useful unit language, provide two model answers, and ask one compact prediction task.",
      "Do not invent a transcript or expose approval criteria.",
    ].join(" "),
  },
  checkpoint: {
    kind: "checkpoint",
    title: "Unit checkpoint briefing",
    requiredSignals: ["Learning objective", "Communication mission", "checkpoint", "Your turn"],
    instruction: [
      "OPENING LEARNING BLOCK: teacher-led checkpoint preparation.",
      "Briefly explain what the checkpoint integrates, provide a model, and ask one integrated response.",
      "Do not show point rubrics in the opening.",
    ].join(" "),
  },
  guided_block: {
    kind: "guided_block",
    title: "Teacher-led opening block",
    requiredSignals: ["Learning objective", "Communication mission", "Your turn"],
    instruction: [
      "OPENING LEARNING BLOCK: teacher-led class opening.",
      "Teach the first learning block, not only the first heading.",
      "Use this order: class objective, communication mission, real context, active teaching, two model examples, one learner task.",
      "Do not include approval scoring, final evaluation gate, recap, score, or session log yet.",
    ].join(" "),
  },
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
  const requiredHits = DELIVERY_POLICY.openingRules.requiredSignals
    .filter((signal) => normalized.includes(normalize(signal))).length;
  const forbiddenHit = DELIVERY_POLICY.openingRules.forbiddenPhrases
    .some((phrase) => normalized.includes(normalize(phrase)));

  return wordCount >= DELIVERY_POLICY.openingRules.minimumWords
    && !forbiddenHit
    && hasSingleClearLearnerTask(text)
    && requiredHits >= Math.min(2, DELIVERY_POLICY.openingRules.requiredSignals.length)
    && policySpecificEvidence(policy.kind, normalized);
}

export function openingQualityFeedback(reply: string, identity: ClassIdentity, localClass?: number | null) {
  const text = String(reply || "");
  const policy = openingBlockPolicy(identity, localClass);
  const normalized = normalize(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const requiredHits = DELIVERY_POLICY.openingRules.requiredSignals
    .filter((signal) => normalized.includes(normalize(signal)));
  const forbiddenHits = DELIVERY_POLICY.openingRules.forbiddenPhrases
    .filter((phrase) => normalized.includes(normalize(phrase)));
  const feedback: string[] = [];

  if (wordCount < DELIVERY_POLICY.openingRules.minimumWords) {
    feedback.push(`The opening is too short (${wordCount} words). It needs fuller teaching before the learner task.`);
  }
  if (!hasSingleClearLearnerTask(text)) {
    feedback.push("The opening must contain exactly one clear learner task, introduced with Your turn.");
  }
  const missingSignals = DELIVERY_POLICY.openingRules.requiredSignals
    .filter((signal) => !requiredHits.includes(signal));
  if (missingSignals.length) {
    feedback.push(`Missing required teaching signals: ${missingSignals.join(", ")}.`);
  }
  if (forbiddenHits.length) {
    feedback.push(`Remove forbidden learner-facing phrases: ${forbiddenHits.join(", ")}.`);
  }
  if (!policySpecificEvidence(policy.kind, normalized)) {
    feedback.push("The opening does not show enough evidence of the required lesson block for this class type.");
  }

  return {
    ok: feedback.length === 0,
    policyKind: policy.kind,
    wordCount,
    feedback,
  };
}

export function guidedOpeningFallback(reply: string, identity: ClassIdentity, localClass?: number | null) {
  if (hasSufficientOpeningBlock(reply, identity, localClass)) return String(reply || "").trim();
  return renderTeacherOpening(buildTeacherOpeningViewModel(identity, localClass));
}

export function openingLearningBlockInstruction(identity: ClassIdentity, localClass?: number | null) {
  return openingBlockPolicy(identity, localClass).instruction;
}

export function buildTeacherOpeningViewModel(identity: ClassIdentity, _localClass?: number | null): TeacherOpeningViewModel {
  const teaching = buildTeachingContractV2(identity);
  return selectSectionTeacherAdapter(teaching).create(teaching);
}

function selectSectionTeacherAdapter(teaching: TeachingContractV2) {
  return SECTION_TEACHER_ADAPTERS.find((adapter) => adapter.canHandle(teaching)) || SECTION_TEACHER_ADAPTERS[SECTION_TEACHER_ADAPTERS.length - 1];
}

const SECTION_TEACHER_ADAPTERS: SectionTeacherAdapter[] = [
  teacherAdapter("checkpoint", (teaching) => teaching.pedagogicalRole === "checkpoint", checkpointOpening),
  teacherAdapter("video", (teaching) => teaching.pedagogicalRole === "video", videoOpening),
  teacherAdapter("grammarPlus", (teaching) => teaching.pedagogicalRole === "grammar-plus", grammarPlusOpening),
  teacherAdapter("listening", (teaching) => teaching.pedagogicalRole === "listening", listeningOpening),
  teacherAdapter("rolePlay", (teaching) => teaching.pedagogicalRole === "role-play", rolePlayOpening),
  teacherAdapter("writing", (teaching) => teaching.pedagogicalRole === "writing", writingOpening),
  teacherAdapter("discussion", (teaching) => teaching.pedagogicalRole === "discussion", discussionOpening),
  teacherAdapter("vocabulary", (teaching) => containsAny(sourceText(teaching), DELIVERY_POLICY.sectionKinds.vocabulary), vocabularyOpening),
  teacherAdapter("grammar", (teaching) => containsAny(sourceText(teaching), DELIVERY_POLICY.sectionKinds.grammar), grammarOpening),
  teacherAdapter("discussion", () => true, discussionOpening),
];

function teacherAdapter(
  kind: TeacherSectionKind,
  canHandle: SectionTeacherAdapter["canHandle"],
  create: (teaching: TeachingContractV2) => TeacherOpeningViewModel,
): SectionTeacherAdapter {
  return { kind, canHandle, create };
}

function baseOpening(teaching: TeachingContractV2, sectionKind: TeacherSectionKind): TeacherOpeningViewModel {
  return {
    sectionKind,
    activeSection: selectActiveSection(teaching, sectionKind),
    objective: learningObjective(teaching),
    mission: communicationMission(teaching, sectionKind),
    warmup: warmupPrompt(teaching, sectionKind),
    context: realContext(teaching, sectionKind),
    focus: teaching.coreConcept,
    patterns: grammarPatterns(teaching),
    usefulLanguage: usefulVocabulary(teaching),
    teacherExplanation: specificExplanation(teaching, sectionKind),
    teacherInput: teacherInput(teaching, sectionKind),
    noticing: noticingPoints(teaching, sectionKind),
    spanishSupport: teaching.spanishSupport.slice(0, 3),
    modelExamples: modelExamples(teaching),
    controlledPractice: controlledPractice(teaching, sectionKind),
    learnerTask: learnerTask(teaching, sectionKind),
  };
}

function grammarOpening(teaching: TeachingContractV2) {
  return baseOpening(teaching, "grammar");
}

function grammarPlusOpening(teaching: TeachingContractV2) {
  return {
    ...baseOpening(teaching, "grammarPlus"),
    context: "This is a consolidation class. We slow down, notice the form, and use it accurately before moving back to freer speaking.",
  };
}

function vocabularyOpening(teaching: TeachingContractV2) {
  return baseOpening(teaching, "vocabulary");
}

function listeningOpening(teaching: TeachingContractV2) {
  return {
    ...baseOpening(teaching, "listening"),
    teacherExplanation: [
      "For listening, do not try to catch every word first. Listen for the main idea, then listen again for one or two useful details.",
      "If the audio resource is available, use it. If it is not available, I can give you a short teacher-created listening practice and I will label it clearly.",
    ],
  };
}

function rolePlayOpening(teaching: TeachingContractV2) {
  return {
    ...baseOpening(teaching, "rolePlay"),
    teacherExplanation: [
      "A good role play needs a clear situation, natural turns, and one useful phrase from the lesson.",
      "Keep the first version short. We can make it more natural after you try.",
    ],
  };
}

function writingOpening(teaching: TeachingContractV2) {
  return {
    ...baseOpening(teaching, "writing"),
    teacherExplanation: [
      "For writing, first decide your main idea. Then add one supporting detail and one example.",
      "A short, clear paragraph is better than a long paragraph with many mixed ideas.",
    ],
  };
}

function discussionOpening(teaching: TeachingContractV2) {
  return baseOpening(teaching, "discussion");
}

function videoOpening(teaching: TeachingContractV2) {
  return {
    ...baseOpening(teaching, "video"),
    activeSection: "Before watching",
    context: "Before watching, we prepare the language you will need. The goal is not to understand every word immediately; first, predict the topic and notice useful unit language.",
    teacherExplanation: [
      "Prediction prepares your brain for the video. Say what you expect to see, then name the words or structures you expect to use.",
      "We will not invent the transcript. We will use your prediction to move into the next video step.",
    ],
  };
}

function checkpointOpening(teaching: TeachingContractV2) {
  return {
    ...baseOpening(teaching, "checkpoint"),
    context: "This checkpoint integrates the unit. First, we prepare the answer; later, I will evaluate whether you can use the unit language accurately enough to advance.",
    learnerTask: "Write 4-6 short sentences that combine the unit grammar, useful vocabulary, and one personal example.",
  };
}

function renderTeacherOpening(opening: TeacherOpeningViewModel) {
  const hasGrammarContent = /grammar|clause|infinitive|gerund|modal|tense|structure|pattern/i
    .test([opening.focus, ...opening.patterns, ...opening.usefulLanguage].join(" "));
  const languageHeading = opening.sectionKind === "grammar" || opening.sectionKind === "grammarPlus" || hasGrammarContent
    ? "Grammar focus"
    : "Key language";
  const vocabularyHeading = opening.usefulLanguage.length ? "Vocabulary & useful expressions" : "";

  return [
    "### Learning objective.",
    ensurePeriod(opening.objective),
    "",
    "### Communication mission.",
    ensurePeriod(opening.mission),
    "",
    `### ${ensurePeriod(opening.activeSection)}`,
    ensurePeriod(opening.warmup),
    "",
    opening.context,
    "",
    `### ${ensurePeriod(languageHeading)}`,
    ensurePeriod(opening.focus),
    "",
    opening.patterns.length ? ["Useful patterns:", ...opening.patterns.map((item) => `- ${item}`)].join("\n") : "",
    "",
    opening.teacherExplanation.map((line) => ensurePeriod(line)).join("\n"),
    "",
    vocabularyHeading ? `### ${ensurePeriod(vocabularyHeading)}` : "",
    opening.usefulLanguage.length ? opening.usefulLanguage.map((item) => `- ${item}`).join("\n") : "",
    "",
    opening.teacherInput.length ? ["### Teacher input.", ...opening.teacherInput.map((item) => ensurePeriod(item))].join("\n") : "",
    "",
    opening.noticing.length ? ["### Notice.", ...opening.noticing.map((item) => `- ${ensurePeriod(item)}`)].join("\n") : "",
    "",
    opening.spanishSupport.length ? ["### Spanish support.", ...opening.spanishSupport.map((item) => `- ${ensurePeriod(item)}`)].join("\n") : "",
    "",
    "### Model answers.",
    ...opening.modelExamples.slice(0, 4).map((item) => `> ${ensurePeriod(item)}`),
    "",
    opening.controlledPractice.length ? ["### Controlled practice.", ...opening.controlledPractice.map((item) => `- ${ensurePeriod(item)}`)].join("\n") : "",
    "",
    "### Your turn.",
    ensurePeriod(opening.learnerTask),
  ].filter(Boolean).join("\n");
}

function renderTeacherOpeningLegacy(opening: TeacherOpeningViewModel) {
  return [
    `**Learning objective:** ${ensurePeriod(opening.objective)}`,
    `**Communication mission:** ${ensurePeriod(opening.mission)}`,
    "",
    `## ${ensurePeriod(opening.activeSection)}`,
    ensurePeriod(opening.warmup),
    "",
    opening.context,
    "",
    `Today’s first focus is simple: ${ensurePeriod(opening.focus)}`,
    "",
    opening.usefulLanguage.length ? ["### Vocabulary & useful expressions.", ...opening.usefulLanguage.map((item) => `- ${item}`)].join("\n") : "",
    "",
    "### Key language.",
    ...opening.teacherExplanation.map((line) => ensurePeriod(line)),
    "",
    opening.teacherInput.length ? ["**Teacher input:**", ...opening.teacherInput.map((item) => ensurePeriod(item))].join("\n") : "",
    "",
    opening.noticing.length ? ["**Notice:**", ...opening.noticing.map((item) => `- ${ensurePeriod(item)}`)].join("\n") : "",
    "",
    opening.spanishSupport.length ? ["**Spanish support:**", ...opening.spanishSupport.map((item) => `- ${ensurePeriod(item)}`)].join("\n") : "",
    "",
    "### Model answers.",
    ...opening.modelExamples.slice(0, 2).map((item) => `> ${ensurePeriod(item)}`),
    "",
    opening.controlledPractice.length ? ["**Controlled practice:**", ...opening.controlledPractice.map((item) => `- ${ensurePeriod(item)}`)].join("\n") : "",
    "",
    "**Your turn:**",
    ensurePeriod(opening.learnerTask),
  ].filter(Boolean).join("\n");
}

function learningObjective(teaching: TeachingContractV2) {
  const concept = cleanConcept(teaching.coreConcept || shortLanguageFocus(teaching));
  if (teaching.pedagogicalRole === "listening") return `Understand the main idea and reuse useful lesson language in your own words`;
  if (teaching.pedagogicalRole === "video") return `Prepare to discuss the video topic using unit vocabulary and one useful structure`;
  if (teaching.pedagogicalRole === "writing") return `Write a short, organized paragraph with one clear main idea`;
  if (teaching.pedagogicalRole === "role-play") return `Start, continue, and close a short conversation naturally`;
  if (teaching.pedagogicalRole === "grammar-plus") return `Consolidate the target grammar and choose the accurate form in context`;
  if (startsWithActionVerb(concept)) return `Learn to ${lowerFirst(concept)} in a clear B1/B2 answer`;
  return `Use ${lowerFirst(concept)} clearly in your own B1/B2 answer`;
}

function communicationMission(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const functions = communicativeFunction(teaching);
  const vocabulary = usefulVocabulary(teaching).slice(0, 4);
  if (sectionKind === "writing") return "Write a short, organized answer with one clear main idea";
  if (sectionKind === "rolePlay") return "Handle a short conversation naturally and politely";
  if (sectionKind === "listening") return "Understand the main idea and respond with useful lesson language";
  if (sectionKind === "video") return "Prepare to understand and discuss the video topic using unit language";
  const mission = ensurePeriod(functions).replace(/\.$/, "");
  const usefulWords = vocabulary.length ? ` Use useful words like ${joinHumanList(vocabulary.slice(0, 3))}.` : "";
  if (mission.split(/\s+/).filter(Boolean).length >= 6) return `${mission}. Give one clear reason or example.${usefulWords}`;
  return `${mission} in a real situation, with one clear reason or example.${usefulWords}`;
}

function realContext(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const topic = lessonTopic(teaching);
  if (sectionKind === "grammar" || sectionKind === "grammarPlus") {
    return `Imagine you need to use the topic "${topic}" in a real conversation. Grammar helps you connect ideas clearly instead of listing them mechanically.`;
  }
  if (sectionKind === "listening") {
    return `Imagine you hear a short conversation about "${topic}". Your first job is to catch the main idea, then reuse useful language in your own answer.`;
  }
  if (sectionKind === "writing") {
    return `Imagine you need to write a short comment about "${topic}". The goal is to sound clear, organized, and natural.`;
  }
  if (sectionKind === "rolePlay") {
    return `Imagine you are speaking with another person in a realistic situation. You need natural phrases, short turns, and a polite ending.`;
  }
  return `Imagine you are using this topic in daily life or at work. You need a clear idea, one reason, and one natural example.`;
}

function warmupPrompt(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const topic = lessonTopic(teaching);
  if (sectionKind === "grammar" || sectionKind === "grammarPlus") {
    return `Let’s first notice how the grammar helps you say something real about "${topic}", not just complete an exercise.`;
  }
  if (sectionKind === "listening") {
    return `Before listening, get ready for the topic "${topic}" and listen first for the general idea.`;
  }
  if (sectionKind === "video") {
    return `Before watching, we prepare your prediction and the useful language you will need.`;
  }
  if (sectionKind === "writing") {
    return `Before writing, choose one clear idea and one example. That keeps your paragraph focused.`;
  }
  if (sectionKind === "rolePlay") {
    return `Before speaking, picture the situation and choose one phrase you can actually use.`;
  }
  return `Let’s connect this lesson to a real situation before you answer.`;
}

function lessonTopic(teaching: TeachingContractV2) {
  return String(teaching.bookAnchor.lessonTitle || "this topic")
    .replace(/[.!?]+$/g, "")
    .trim() || "this topic";
}

function usefulLanguage(teaching: TeachingContractV2) {
  return uniqueTeachingItems([
    ...teaching.targetLanguage.patterns,
    ...teaching.targetLanguage.vocabulary,
    ...teaching.targetLanguage.functions,
  ]).slice(0, 7);
}

function grammarPatterns(teaching: TeachingContractV2) {
  return uniqueTeachingItems([
    ...teaching.targetLanguage.patterns,
    ...teaching.targetLanguage.grammar,
  ]).filter(isLearnerFacingPattern).slice(0, 5);
}

function usefulVocabulary(teaching: TeachingContractV2) {
  return uniqueTeachingItems(teaching.targetLanguage.vocabulary)
    .filter(isLearnerFacingVocabulary)
    .slice(0, 8);
}

function uniqueTeachingItems(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLearnerFacingPattern(item: string) {
  const text = cleanConcept(item);
  if (!text) return false;
  if (isBookActivityLabel(text)) return false;
  return !/^(grammar focus|unit grammar|use target structures)$/i.test(text);
}

function isLearnerFacingVocabulary(item: string) {
  const text = cleanConcept(item);
  if (!text) return false;
  if (isBookActivityLabel(text)) return false;
  if (/^types of\b/i.test(text)) return false;
  if (/^(comment|discuss|express|describe|talk|use|practice)\b/i.test(text)) return false;
  return true;
}

function teacherInput(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  if (sectionKind === "listening") {
    return [
      "**Teacher listening input:**",
      listeningMiniDialogue(teaching),
      "Gist question: What is the main idea?",
      "Detail question: Which useful words or expressions did you hear?",
    ];
  }
  if (sectionKind === "reading") {
    return [
      "**Teacher reading input:**",
      readingMiniText(teaching),
      "Read for the main idea first. Then notice one useful word or structure you can reuse.",
    ];
  }
  if (sectionKind === "writing") {
    return [
      "**Writing frame:**",
      "My main idea is ______. One reason is ______. For example, ______. Because of that, ______.",
    ];
  }
  return [];
}

function noticingPoints(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  if (sectionKind === "grammar" || sectionKind === "grammarPlus") {
    return [
      "Form and meaning work together: first check the structure, then check what idea it communicates.",
      "A short accurate sentence is better than a long sentence with unclear grammar.",
    ];
  }
  if (sectionKind === "vocabulary") {
    return [
      "Learn chunks as complete phrases so you can speak faster.",
      "Use the chunk in a real sentence, not as an isolated translation.",
    ];
  }
  if (sectionKind === "listening" || sectionKind === "video") {
    return [
      "First catch the gist; details come second.",
      "Reuse one word or phrase from the input in your own answer.",
    ];
  }
  if (sectionKind === "writing") {
    return [
      "The first sentence should make the main idea clear.",
      "Every supporting sentence should connect back to that main idea.",
    ];
  }
  return [
    "Give one clear idea, then add one reason or example.",
  ];
}

function specificExplanation(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const patternExplanation = grammarPatternExplanation(teaching);
  if (patternExplanation.length && (sectionKind === "grammar" || sectionKind === "grammarPlus" || teaching.targetLanguage.patterns.length)) {
    return patternExplanation;
  }
  if (sectionKind === "grammar" || sectionKind === "grammarPlus") {
    return [
      "Use the structure to express one clear idea first. Then add a reason or example so the answer sounds complete.",
      "Notice the form first, then use it in a short personal sentence. Accuracy matters more than length in this first step.",
    ];
  }
  if (sectionKind === "vocabulary") {
    return [
      "Vocabulary is easier to remember as chunks, not isolated words.",
      "Use one chunk in a complete sentence and add a reason with because.",
    ];
  }
  return [
    "Use the lesson language in one clear situation before you expand the answer.",
    "Start with a simple answer, then add one reason or example so it sounds more complete.",
  ];
}

function grammarPatternExplanation(teaching: TeachingContractV2) {
  const patterns = grammarPatterns(teaching);
  if (!patterns.length) return [];
  const lines = [
    "First understand what the structure helps you do, then use it in a short answer of your own.",
  ];
  patterns.slice(0, 3).forEach((pattern, index) => {
    lines.push(`Pattern ${index + 1}: ${pattern}.`);
  });
  if (patterns.some((pattern) => /infinitive/i.test(pattern)) && patterns.some((pattern) => /gerund/i.test(pattern))) {
    lines.push("The infinitive pattern usually introduces your comment first. The gerund pattern makes the action itself the subject, which often sounds a little more formal or mature.");
  }
  return lines;
}

function modelExamples(teaching: TeachingContractV2) {
  const examples = teaching.modelExamples.filter(Boolean);
  if (examples.length >= 2) return examples;
  return [
    "I can explain my idea clearly with one useful phrase from the lesson.",
    "I can add one short reason so my answer sounds more natural.",
  ];
}

function controlledPractice(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const items = teaching.controlledPractice.filter(Boolean).slice(0, 4);
  if (items.length) return items;
  if (sectionKind === "rolePlay") {
    return [
      "A: ______",
      "B: ______",
      "Add one follow-up question and one polite closing.",
    ];
  }
  if (sectionKind === "writing") {
    return [
      "Topic sentence: ______",
      "Supporting example: ______",
    ];
  }
  if (sectionKind === "video" || sectionKind === "listening") {
    return [
      "The main idea is ______.",
      "One useful detail is ______.",
    ];
  }
  return [
    "Complete one short sentence with the target language before writing your full answer.",
  ];
}

function learnerTask(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const task = String(teaching.guidedProduction || "").trim();
  if (task) return enrichLearnerTask(task, teaching, sectionKind);
  if (sectionKind === "video") return "Write two short predictions about the video. Use one useful word or structure from the unit.";
  if (sectionKind === "writing") return "Write 4-5 sentences with one clear topic sentence and one supporting example.";
  if (sectionKind === "rolePlay") return "Write a 4-6 line dialogue using one opener, one follow-up, and one polite closing.";
  return "Write 3-5 sentences using the target language and one personal example.";
}

function enrichLearnerTask(task: string, teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  const requirements = learnerTaskRequirements(teaching, sectionKind);
  if (!requirements.length) return task;
  return [
    task,
    "",
    "Include:",
    ...requirements.map((requirement, index) => `${index + 1}. ${requirement}`),
  ].join("\n");
}

function learnerTaskRequirements(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  if (sectionKind === "video" || sectionKind === "listening") {
    return [
      "one main idea",
      "one useful word, chunk, or structure from the unit",
      "one short personal connection or reason",
    ];
  }
  if (sectionKind === "rolePlay") {
    return [
      "one opener",
      "one follow-up question",
      "one short reply",
      "one polite closing",
    ];
  }
  if (sectionKind === "writing") {
    return [
      "one clear topic sentence",
      "one supporting detail",
      "one example or reason",
    ];
  }
  const patterns = grammarPatterns(teaching).slice(0, 2);
  const vocabulary = usefulVocabulary(teaching).slice(0, 3);
  return [
    patterns[0] ? `one sentence with ${patterns[0]}` : "",
    patterns[1] ? `one sentence with ${patterns[1]}` : "",
    vocabulary.length ? `two useful words or chunks from this list: ${vocabulary.join(", ")}` : "",
    "one reason or example",
  ].filter(Boolean).slice(0, 4);
}

function shortLanguageFocus(teaching: TeachingContractV2) {
  return (
    teaching.targetLanguage.patterns[0] ||
    teaching.targetLanguage.grammar[0] ||
    teaching.targetLanguage.vocabulary[0] ||
    teaching.coreConcept ||
    "the class language"
  );
}

function communicativeFunction(teaching: TeachingContractV2) {
  const candidates = [
    ...teaching.targetLanguage.functions,
    teaching.bookAnchor.skillFocus,
    teaching.coreConcept,
  ].map(cleanConcept).filter(Boolean);
  return candidates.find((candidate) => !isBookActivityLabel(candidate))
    || cleanConcept(teaching.coreConcept)
    || "Use the lesson language in a real conversation";
}

function isBookActivityLabel(value: string) {
  return /^(define boldfaced words|complete|rewrite|choose|circle|match|listen and repeat|answer questions)$/i.test(String(value || "").trim());
}

function cleanConcept(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function lowerFirst(value: string) {
  const text = cleanConcept(value);
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "the lesson language";
}

function joinHumanList(items: string[]) {
  const clean = items.map(cleanConcept).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function startsWithActionVerb(value: string) {
  return /^(comment|describe|talk|explain|speculate|give|ask|answer|write|start|continue|close|compare|discuss|use|practice|prepare|understand|identify|summarize)\b/i
    .test(cleanConcept(value));
}

function listeningMiniDialogue(teaching: TeachingContractV2) {
  const topic = lessonTopic(teaching);
  const words = usefulLanguage(teaching).slice(0, 3);
  const first = words[0] || "the main idea";
  const second = words[1] || "one detail";
  return `A: I heard something interesting about ${topic}. B: Really? What was the main point? A: It was mainly about ${first}, and it also mentioned ${second}.`;
}

function readingMiniText(teaching: TeachingContractV2) {
  const topic = lessonTopic(teaching);
  const words = usefulLanguage(teaching).slice(0, 2).join(" and ") || "the lesson topic";
  return `This short text is about ${topic}. It introduces ${words} and gives you language you can reuse in your own answer.`;
}

function selectOpeningSections(teaching: TeachingContractV2, kind: OpeningBlockPolicy["kind"]) {
  const sections = teaching.bookAnchor.sections;
  const selected = kind === "video"
    ? sections.filter((section) => !sameText(section, "Video Class")).slice(0, 2)
    : sections.slice(0, kind === "checkpoint" ? 3 : 3);
  return selected.length ? selected : [teaching.bookAnchor.lessonTitle || "Starting point"];
}

function selectActiveSection(teaching: TeachingContractV2, sectionKind: TeacherSectionKind) {
  if (sectionKind === "video") return "Before watching";
  if (sectionKind === "checkpoint") return "Unit checkpoint";
  return selectOpeningSections(teaching, openingBlockPolicyKind(teaching))[0] || teaching.presentation.warmupHeading || "Starting point";
}

function openingBlockPolicyKind(teaching: TeachingContractV2): OpeningBlockPolicy["kind"] {
  return ROLE_KIND[teaching.pedagogicalRole] || "guided_block";
}

function hasSingleClearLearnerTask(text: string) {
  const normalized = normalize(text);
  const hits = ["your turn", "now your turn"].filter((signal) => normalized.includes(signal)).length;
  return hits === 1;
}

function policySpecificEvidence(kind: OpeningBlockPolicy["kind"], normalized: string) {
  const requirements: Record<OpeningBlockPolicy["kind"], string[]> = {
    video: ["before watching", "prediction", "video"],
    checkpoint: ["checkpoint", "unit", "your turn"],
    guided_block: ["teacher explanation", "two model", "useful language"],
  };
  const required = requirements[kind];
  return required.filter((signal) => normalized.includes(normalize(signal))).length >= (kind === "guided_block" ? 2 : 1);
}

function sourceText(teaching: TeachingContractV2) {
  return [
    teaching.pedagogicalRole,
    teaching.languageFamily,
    teaching.bookAnchor.sections.join(" "),
    teaching.bookAnchor.skillFocus,
    teaching.targetLanguage.grammar.join(" "),
    teaching.targetLanguage.patterns.join(" "),
    teaching.targetLanguage.vocabulary.join(" "),
    teaching.targetLanguage.functions.join(" "),
  ].join(" ");
}

function containsAny(value: string, signals: readonly string[]) {
  const normalized = normalize(value);
  return signals.some((signal) => normalized.includes(normalize(signal)));
}

function sameText(left: string, right: string) {
  return normalize(left) === normalize(right);
}

function normalize(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function ensurePeriod(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?)]$/.test(text) ? text : `${text}.`;
}
