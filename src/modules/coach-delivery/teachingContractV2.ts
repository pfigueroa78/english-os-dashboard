import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";
import {
  LANGUAGE_FAMILY_PROFILES,
  PEDAGOGICAL_ROLE_PROFILES,
  type LanguageFamilyProfile,
  type LessonLanguageFamily,
  type PedagogicalRole,
} from "@/modules/coach-delivery/pedagogicalProfiles";

export type { LessonLanguageFamily, PedagogicalRole } from "@/modules/coach-delivery/pedagogicalProfiles";

export type TeachingContractV2 = {
  bookAnchor: {
    lessonTitle: string;
    sections: string[];
    skillFocus: string;
  };
  pedagogicalRole: PedagogicalRole;
  languageFamily: LessonLanguageFamily;
  coreConcept: string;
  presentation: {
    warmupHeading: string;
    explanationHeading: string;
    productionHeading: string;
  };
  targetLanguage: {
    grammar: string[];
    vocabulary: string[];
    functions: string[];
    patterns: string[];
  };
  spanishSupport: string[];
  modelExamples: string[];
  controlledPractice: string[];
  guidedProduction: string;
  evaluationCriteria: string[];
  commonMistakes: string[];
};

const VARIANT_ROLE_BY_NAME: Partial<Record<PedagogicalRole, "grammarPlus">> = {
  "grammar-plus": "grammarPlus",
};

const DEFAULT_WARMUP_HEADING_BY_ROLE: Partial<Record<PedagogicalRole, string>> = {
  listening: "Warm-up: listening purpose",
  "role-play": "Warm-up: role-play situation",
  writing: "Warm-up: writing purpose",
  discussion: "Warm-up: opinion and reason",
};

const DEFAULT_EXPLANATION_HEADING_BY_ROLE: Partial<Record<PedagogicalRole, string>> = {
  listening: "Teacher explanation: Gist and Details",
  writing: "Teacher explanation: organize before writing",
  "role-play": "Teacher explanation: conversation moves",
};

const DEFAULT_PRODUCTION_HEADING_BY_ROLE: Partial<Record<PedagogicalRole, string>> = {
  writing: "Writing practice",
};

const DEFAULT_GUIDED_PRODUCTION_BY_ROLE: Partial<Record<PedagogicalRole, string>> = {
  discussion: "Give your opinion in 3-5 sentences. Include one reason and one example.",
  "role-play": "Write a 4-6 line dialogue. Include an opening, one follow-up question, one short response, and a natural closing.",
  writing: "Write one short paragraph of 4-5 sentences. Include one clear topic sentence and one supporting example.",
};

const EXPECTED_PRODUCTION_FIRST_FAMILIES = new Set<LessonLanguageFamily>(["general"]);

type SourceLens = {
  primary: string;
  full: string;
  firstSection: string;
};

type MatchScore = {
  score: number;
  priority: number;
};

const CONTRACT_CACHE_LIMIT = 256;
const teachingContractCache = new Map<string, TeachingContractV2>();

export function splitTeachingItems(value: string, limit = 24) {
  const text = String(value || "");
  const separator = text.includes(";") ? /;/ : /,/;
  return text
    .split(separator)
    .map((item) => learnerSafeTeachingCue(item))
    .filter(Boolean)
    .slice(0, limit);
}

export function learnerSafeTeachingCue(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/\b(recycle confirmed|confirmed unit|indexed unit|indexed .*context|student book|do not invent|unverified|learner-safe|target structures confirmed|from indexed|based only on)\b/i.test(text)) {
    return "";
  }
  return text.replace(/\s+/g, " ").trim();
}

export function buildTeachingContractV2(identity: ClassIdentity): TeachingContractV2 {
  const cacheKey = teachingContractCacheKey(identity);
  const cached = teachingContractCache.get(cacheKey);
  if (cached) return cached;
  const contract = createTeachingContractV2(identity);
  teachingContractCache.set(cacheKey, contract);
  if (teachingContractCache.size > CONTRACT_CACHE_LIMIT) {
    const oldestKey = teachingContractCache.keys().next().value;
    if (oldestKey) teachingContractCache.delete(oldestKey);
  }
  return contract;
}

function createTeachingContractV2(identity: ClassIdentity): TeachingContractV2 {
  const sections = parseSections(identity.sections);
  const grammar = splitTeachingItems(identity.grammarFocus, 12);
  const vocabulary = splitTeachingItems(identity.vocabularyFocus, 24);
  const functions = splitTeachingItems(identity.functions || identity.skillFocus, 12);
  const patterns = splitTeachingItems(identity.targetStructures || identity.grammarFocus, 16);
  const source = buildSourceLens(identity, sections, grammar, vocabulary, functions, patterns);
  const role = selectPedagogicalRole(source);
  const profile = selectLanguageFamilyProfile(source);

  return {
    bookAnchor: {
      lessonTitle: learnerSafeTeachingCue(identity.lessonTitle) || sections[0] || "Class session",
      sections,
      skillFocus: learnerSafeTeachingCue(identity.skillFocus),
    },
    pedagogicalRole: role,
    languageFamily: profile.family,
    coreConcept: buildCoreConcept(profile, functions, identity.lessonTitle),
    presentation: {
      warmupHeading: profile.warmupHeading || defaultWarmupHeading(role),
      explanationHeading: profile.explanationHeading || defaultExplanationHeading(role),
      productionHeading: profile.productionHeading || defaultProductionHeading(role),
    },
    targetLanguage: {
      grammar,
      vocabulary,
      functions,
      patterns,
    },
    spanishSupport: (profile.spanishSupport || []).slice(0, 3),
    modelExamples: (profile.modelExamples || []).slice(0, 4),
    controlledPractice: selectPractice(profile, role),
    guidedProduction: selectGuidedProduction(profile, role, identity.expectedProduction),
    evaluationCriteria: evaluationCriteriaFor(profile.family, source.full),
    commonMistakes: commonMistakesFor(profile, source.full),
  };
}

function teachingContractCacheKey(identity: ClassIdentity) {
  return [
    identity.lessonTitle,
    identity.sections,
    identity.skillFocus,
    identity.grammarFocus,
    identity.vocabularyFocus,
    identity.functions,
    identity.targetStructures,
    identity.expectedProduction,
  ].map((value) => String(value || "").trim()).join("\u001f");
}

function defaultWarmupHeading(role: PedagogicalRole) {
  return DEFAULT_WARMUP_HEADING_BY_ROLE[role] || "Warm-up: real communication situation";
}

function defaultExplanationHeading(role: PedagogicalRole) {
  return DEFAULT_EXPLANATION_HEADING_BY_ROLE[role] || "Teacher explanation";
}

function defaultProductionHeading(role: PedagogicalRole) {
  return DEFAULT_PRODUCTION_HEADING_BY_ROLE[role] || "Speaking practice";
}

function parseSections(value: string) {
  return String(value || "")
    .split("+")
    .map((section) => learnerSafeTeachingCue(section))
    .filter(Boolean);
}

function buildSourceLens(
  identity: ClassIdentity,
  sections: string[],
  grammar: string[],
  vocabulary: string[],
  functions: string[],
  patterns: string[],
): SourceLens {
  const primary = [
    identity.lessonTitle,
    sections.join(" "),
    grammar.join(" "),
    patterns.join(" "),
    identity.expectedProduction,
  ].join(" ").toLowerCase();
  const full = [primary, vocabulary.join(" "), functions.join(" "), identity.skillFocus].join(" ").toLowerCase();
  return {
    primary,
    full,
    firstSection: (sections[0] || "").toLowerCase(),
  };
}

function selectPedagogicalRole(source: SourceLens): PedagogicalRole {
  const best = PEDAGOGICAL_ROLE_PROFILES
    .map((profile) => ({
      profile,
      match: scoreSignals(source.full, profile.signals, profile.priority, source.firstSection, profile.firstSectionSignals),
    }))
    .sort((left, right) => compareMatches(right.match, left.match))[0];
  return best?.match.score ? best.profile.role : "student-book-block";
}

function selectLanguageFamilyProfile(source: SourceLens): LanguageFamilyProfile {
  const fallback = LANGUAGE_FAMILY_PROFILES[LANGUAGE_FAMILY_PROFILES.length - 1];
  const best = LANGUAGE_FAMILY_PROFILES
    .map((profile) => ({
      profile,
      match: scoreLanguageProfile(source, profile),
    }))
    .sort((left, right) => compareMatches(right.match, left.match))[0];
  return best?.match.score ? best.profile : fallback;
}

function scoreLanguageProfile(source: SourceLens, profile: LanguageFamilyProfile): MatchScore {
  const primaryScore = countSignalHits(source.primary, profile.primarySignals || []) * 2;
  const fullScore = countSignalHits(source.full, profile.fullSignals || []);
  const score = primaryScore + fullScore;
  return {
    score,
    priority: score > 0 ? profile.priority : 0,
  };
}

function scoreSignals(
  text: string,
  signals: readonly string[],
  priority: number,
  firstSection: string,
  firstSectionSignals: readonly string[] = [],
): MatchScore {
  const score = countSignalHits(text, signals) + countSignalHits(firstSection, firstSectionSignals) * 2;
  return {
    score,
    priority: score > 0 ? priority : 0,
  };
}

function countSignalHits(text: string, signals: readonly string[]) {
  return signals.reduce((count, signal) => count + (containsSignal(text, signal) ? 1 : 0), 0);
}

function containsSignal(text: string, signal: string) {
  return normalizeForMatching(text).includes(normalizeForMatching(signal));
}

function normalizeForMatching(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function compareMatches(left: MatchScore, right: MatchScore) {
  if (left.score !== right.score) return left.score - right.score;
  return left.priority - right.priority;
}

function buildCoreConcept(profile: LanguageFamilyProfile, functions: string[], lessonTitle: string) {
  const purpose = functions.find(Boolean);
  if (profile.family !== "general") return profile.coreConcept;
  const safeLesson = learnerSafeTeachingCue(lessonTitle);
  return purpose ? `Use this lesson language to ${purpose}.` : `Use the language from ${safeLesson || "this lesson"} in a clear real-life answer.`;
}

function selectPractice(profile: LanguageFamilyProfile, role: PedagogicalRole) {
  const variant = variantRole(role);
  const practice = variant === "grammarPlus" && profile.grammarPlusPractice?.length
    ? profile.grammarPlusPractice
    : profile.controlledPractice;
  return (practice || [
    "Write one sentence with the target pattern.",
    "Add one useful word or chunk from the lesson.",
    "Give one short personal example.",
  ]).slice(0, 4);
}

function selectGuidedProduction(profile: LanguageFamilyProfile, role: PedagogicalRole, expectedProduction: string) {
  const expected = learnerSafeTeachingCue(expectedProduction);
  if (variantRole(role) === "grammarPlus" && profile.grammarPlusProduction) return profile.grammarPlusProduction;
  if (!EXPECTED_PRODUCTION_FIRST_FAMILIES.has(profile.family) && profile.guidedProduction) return profile.guidedProduction;
  if (DEFAULT_GUIDED_PRODUCTION_BY_ROLE[role]) return DEFAULT_GUIDED_PRODUCTION_BY_ROLE[role];
  if (EXPECTED_PRODUCTION_FIRST_FAMILIES.has(profile.family) && expected) return expected;
  return profile.guidedProduction || expected || "Write 3-5 sentences using the target language, useful vocabulary, and one personal example.";
}

function variantRole(role: PedagogicalRole) {
  return VARIANT_ROLE_BY_NAME[role] || "default";
}

function evaluationCriteriaFor(family: LessonLanguageFamily, source: string) {
  const criteria = [
    "2 pts - uses the target language accurately",
    "2 pts - uses vocabulary or chunks from the class",
    "2 pts - gives complete answers with a clear idea",
    "2 pts - sounds natural for B1/B2 communication",
  ];
  const socialWorkOrDailySituation = ["small-talk", "social-behavior"].includes(family)
    || containsAnySignal(source, ["professional", "work", "meeting", "productivity", "schedule", "responsibilities"]);
  criteria.push(
    socialWorkOrDailySituation
      ? "2 pts - connects the answer to a realistic social, work, or daily-life situation"
      : "2 pts - includes one personal example",
  );
  criteria.push("Pass: 8/10. Review: 6-7/10. Repeat: below 6/10.");
  return criteria;
}

function commonMistakesFor(profile: LanguageFamilyProfile, source: string) {
  const profileMistakes = profile.commonMistakes || [];
  const modalMistake = containsAnySignal(source, ["should", "ought to", "might want to"])
    ? ["After should / could / might, use the base verb: should rest, not should to rest."]
    : [];
  const gerundMistake = containsAnySignal(source, ["gerund", "infinitive"])
    ? ["After prefer for habits, prefer + -ing is often natural: I prefer working early."]
    : [];
  return [...profileMistakes, ...modalMistake, ...gerundMistake].slice(0, 3);
}

function containsAnySignal(text: string, signals: readonly string[]) {
  return signals.some((signal) => containsSignal(text, signal));
}
