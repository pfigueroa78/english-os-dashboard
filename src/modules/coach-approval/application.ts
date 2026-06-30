import {
  getApprovalPolicyConfig,
  getGrammarRuleSetConfig,
  type ApprovalCriterionId,
  type ProductionType,
} from "@/modules/coach-config/pedagogyConfig";

export type ApprovalStatus = "approved" | "needs_work";

export type ClassApprovalRubric = {
  classId: string;
  lessonType: string;
  grammarTargets: string[];
  vocabularyTargets: string[];
  communicativeFunctions: string[];
  expectedProduction: string[];
  minSentences: number;
  requiresEvaluationGate: boolean;
  productionType: ProductionType;
};

export type ClassApprovalEvaluation = {
  classId: string;
  evaluationGateCompleted: boolean;
  activeSectionsCompleted: boolean;
  grammarApproved: boolean;
  vocabularyApproved: boolean;
  communicativeGoalApproved: boolean;
  productionApproved: boolean;
  blockingErrors: string[];
  canApproveClass: boolean;
  approvalEvidence: string[];
  retryPrompt: string;
  rubric: ClassApprovalRubric;
  scores: {
    grammar: ApprovalStatus;
    vocabulary: ApprovalStatus;
    communicativeGoal: ApprovalStatus;
    production: ApprovalStatus;
    personalConnection: ApprovalStatus;
  };
  score: number;
  evaluatorVersion: string;
  policyId: string;
};

const GENERIC_CLASS_ID = "active-class";
const EVALUATOR_VERSION = "rubric-config-v1";

function collectStrings(value: unknown, limit = 200) {
  const strings: string[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown) => {
    if (strings.length >= limit || node == null) return;
    if (typeof node === "string") {
      const text = node.trim();
      if (text) strings.push(text);
      return;
    }
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    for (const child of Object.values(node as Record<string, unknown>)) visit(child);
  };
  visit(value);
  return strings;
}

function firstByPattern(strings: string[], pattern: RegExp) {
  return strings.find((text) => pattern.test(text)) || "";
}

function splitList(value: string) {
  return value
    .replace(/^[-*]\s*/g, "")
    .replace(/^Active class (target structures|grammar focus|vocabulary focus|skill focus):\s*/i, "")
    .split(/;|,|\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2)
    .slice(0, 12);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isGenericTeachingTarget(value: string) {
  return /\b(accurate forms?|target language|useful language|unit\s+\d+|current unit|class topic|key language)\b/i.test(value) ||
    /\b(from|for)\s+unit\s+\d+\b/i.test(value) ||
    /\b(do not|unindexed|unverified|student book|class-pack|learner-safe|indexed .*context|confirmed .*context|confirmed unit|recycle confirmed)\b/i.test(value);
}

function resolveClassId(source: unknown, strings: string[]) {
  const coordinates = strings.join(" ").match(/\bunit\s+(\d{1,2}).{0,40}\bclass\s+(\d{1,2})\b/i);
  if (coordinates) return `unit-${coordinates[1].padStart(2, "0")}-class-${coordinates[2].padStart(2, "0")}`;

  const objectSource = source && typeof source === "object" ? source as Record<string, unknown> : {};
  const unit = String(objectSource.unit || objectSource.currentUnit || "").match(/\d{1,2}/)?.[0];
  const klass = String(objectSource.localClass || objectSource.currentClass || objectSource.globalClass || "").match(/\d{1,2}/)?.[0];
  if (unit && klass) return `unit-${unit.padStart(2, "0")}-class-${klass.padStart(2, "0")}`;

  return GENERIC_CLASS_ID;
}

export function buildClassApprovalRubric(source: unknown = null): ClassApprovalRubric {
  const strings = collectStrings(source);
  const lines = strings.flatMap((text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const grammarLine = firstByPattern(lines, /Active class grammar focus:|grammar focus:/i);
  const vocabularyLine = firstByPattern(lines, /Active class vocabulary focus:|vocabulary focus:/i);
  const targetLine = firstByPattern(lines, /Active class target structures:|target structures:/i);
  const skillLine = firstByPattern(lines, /Active class skill focus:|skill focus:|class sections:/i);
  const productionLine = firstByPattern(lines, /Expected learner production:|expected production:|production task:/i);
  const lessonTypeLine = firstByPattern(lines, /Video Class|Grammar Plus|Practice Lab|Listening|Speaking|Writing|Discussion|Role Play/i);

  const targetStructures = splitList(targetLine).filter((item) => !isGenericTeachingTarget(item));
  const grammarTargets = unique([
    ...splitList(grammarLine).filter((item) => !isGenericTeachingTarget(item)),
    ...targetStructures.filter((item) => /\b(should|must|could|might|although|however|before|after|while|when|whenever|used to|gerund|infinitive|clause|passive|reported|future|conditional)\b/i.test(item)),
  ]);
  const vocabularyTargets = unique([
    ...splitList(vocabularyLine).filter((item) => !isGenericTeachingTarget(item)),
    ...targetStructures.filter((item) => !grammarTargets.includes(item)),
  ]);
  const communicativeFunctions = unique(splitList(skillLine).filter((item) => /\b(speaking|discussion|role play|writing|listening|conversation|describe|explain|compare|react|summarize|predict|advice|opinion)\b/i.test(item)));
  const expectedProduction = unique([...splitList(productionLine), ...targetStructures.slice(0, 4)]);
  const productionType = inferProductionType(
    productionLine || targetLine || [skillLine, lessonTypeLine].join(" ")
  );

  return {
    classId: resolveClassId(source, strings),
    lessonType: lessonTypeLine || "guided class",
    grammarTargets,
    vocabularyTargets,
    communicativeFunctions,
    expectedProduction,
    minSentences: getApprovalPolicyConfig().responsePolicies.minimumSentencesByProductionType[productionType],
    requiresEvaluationGate: true,
    productionType,
  };
}

function normalizeAnswer(answer: string) {
  return answer.trim().replace(/\s+/g, " ");
}

function sentenceCount(answer: string) {
  return answer.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length || (answer.trim() ? 1 : 0);
}

function tokenPattern(target: string) {
  const cleaned = target
    .replace(/\([^)]*\)/g, " ")
    .replace(/\.\.\./g, " ")
    .replace(/[_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter((word) => word.length > 2);
  return words.slice(0, Math.min(words.length, 4));
}

function countTargetMatches(answer: string, targets: string[]) {
  const lower = answer.toLowerCase();
  return targets.filter((target) => {
    if (/\bgerund\b/i.test(target) && /\b[a-z]{3,}ing\b/i.test(answer)) return true;
    if (/\binfinitive\b/i.test(target) && /\bto\s+[a-z]{3,}\b/i.test(answer)) return true;
    if (/\bshould have\b/i.test(target) && /\bshould\s+have\s+[a-z]{3,}(ed|en)\b/i.test(answer)) return true;
    if (/\b(was|were)\s+supposed\s+to\b/i.test(target) && /\b(was|were)\s+supposed\s+to\s+[a-z]{2,}\b/i.test(answer)) return true;
    if (/\bused to\b/i.test(target) && /\bused\s+to\s+[a-z]{2,}\b/i.test(answer)) return true;
    if (/\bhas become\b/i.test(target) && /\b(has|have)\s+become\b/i.test(answer)) return true;
    if (/\bmodals?\b|\bcertainty\b|\buncertainty\b|\bmust have\b|\bmight have\b|\bcould have\b/i.test(target) && /\b(must|might|may|could|can't)\s+(have\s+)?[a-z]{2,}\b/i.test(answer)) return true;
    if (/\badjective clauses?\b|\brelative clauses?\b|\bthat\b|\bwhere\b|\bwhich\b|\bwho\b/i.test(target) && /\b(that|where|which|who|when)\b/i.test(answer)) return true;
    if (/\bpresent perfect\b|\bhave\/has\b/i.test(target) && /\b(have|has)\s+[a-z]{3,}(ed|en)\b/i.test(answer)) return true;
    if (/\bfuture perfect continuous\b/i.test(target) && /\bwill\s+have\s+been\s+[a-z]{3,}ing\b/i.test(answer)) return true;
    if (/\bfuture perfect\b/i.test(target) && /\bwill\s+have\s+[a-z]{3,}(ed|en)\b/i.test(answer)) return true;
    if (/\bconditionals?\b|\bif clauses?\b/i.test(target) && /\bif\b.+\b(would|could|will|can)\b|\b(would|could|will|can)\b.+\bif\b/i.test(answer)) return true;
    if (/\bindirect questions?\b/i.test(target) && /\b(i wonder|i'd like to know|i want to find out|what i don't get is|my big concern is whether|whether|if)\b/i.test(answer)) return true;
    if (/\bsmall talk\b|\bconversation\b|\bopeners?\b|\bclosers?\b/i.test(target) && /\b(how's it going|how are you|see you|got to run|great to meet|do you know|can you believe)\b/i.test(answer)) return true;
    if (/\badvice\b|\bsuggestion\b|\brecommend\b|\bought to\b|\bshould\b/i.test(target) && /\b(should|could|might want to|recommend|ought to|it might not be a bad idea)\b/i.test(answer)) return true;
    if (/\breported\b/i.test(target) && /\b(said|told|asked|warned|explained)\b/i.test(answer)) return true;
    if (/\b(time clauses?|before|after|while|when|whenever|as soon as)\b/i.test(target) && /\b(before|after|while|when|whenever|as soon as|until)\b/i.test(answer)) return true;
    const words = tokenPattern(target);
    if (words.length === 0) return false;
    const required = Math.min(words.length, 2);
    return words.filter((word) => lower.includes(word.toLowerCase())).length >= required;
  }).length;
}

function hasBlockingGrammarError(answer: string) {
  return getGrammarRuleSetConfig().rules
    .filter((rule) => rule.severity === "blocking" && new RegExp(rule.pattern, "i").test(answer))
    .map((rule) => rule.message);
}

function inferProductionType(source: string): ProductionType {
  const text = String(source || "").toLowerCase();
  if (/\bcheckpoint\b/.test(text)) return "checkpoint";
  if (/\bdialogue|role play|role-play\b/.test(text)) return "dialogue";
  if (/\bparagraph|writing|outline\b/.test(text)) return "paragraph";
  if (/\bdiscussion|opinion\b/.test(text)) return "discussion";
  if (/\bspeaking|conversation|conversation closers?|conversation openers?\b/.test(text)) return "speaking";
  return "short-answer";
}

function contentWordCount(answer: string) {
  return answer
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((word) => word.length > 2).length;
}

function criterionPoints(id: ApprovalCriterionId, approved: boolean) {
  const criterion = getApprovalPolicyConfig().criteria.find((item) => item.id === id);
  return approved ? criterion?.points || 0 : 0;
}

export function evaluateClassApproval(params: {
  answer: string;
  rubric?: ClassApprovalRubric;
  classPack?: unknown;
  evaluationGateCompleted?: boolean;
  activeSectionsCompleted?: boolean;
}): ClassApprovalEvaluation {
  const answer = normalizeAnswer(params.answer);
  const rubric = params.rubric || buildClassApprovalRubric(params.classPack);
  const policy = getApprovalPolicyConfig();
  const blockingErrors = hasBlockingGrammarError(answer);
  const sentences = sentenceCount(answer);
  const words = contentWordCount(answer);
  const grammarMatches = countTargetMatches(answer, rubric.grammarTargets);
  const vocabularyMatches = countTargetMatches(answer, rubric.vocabularyTargets);
  const productionMatches = countTargetMatches(answer, rubric.expectedProduction);
  const functionMatches = countTargetMatches(answer, rubric.communicativeFunctions);
  const minContentWords = policy.responsePolicies.minimumContentWordsByProductionType[rubric.productionType];
  const hasEnoughProductionEvidence = sentences >= rubric.minSentences && words >= minContentWords;
  const hasTargetEvidence = grammarMatches > 0 || vocabularyMatches > 0 || functionMatches > 0;

  const grammarApproved = blockingErrors.length === 0 && (rubric.grammarTargets.length === 0 || grammarMatches > 0);
  const vocabularyApproved = rubric.vocabularyTargets.length === 0 || vocabularyMatches > 0;
  const productionApproved = hasEnoughProductionEvidence && (
    rubric.expectedProduction.length === 0 ||
    productionMatches > 0 ||
    (policy.responsePolicies.expectedProductionEvidenceStrategy === "task-or-target-evidence" && hasTargetEvidence)
  );
  const communicativeGoalApproved = rubric.communicativeFunctions.length === 0 || functionMatches > 0 || productionApproved;
  const personalConnectionApproved = /\b(i|my|me|we|our|at work|in my|for example|because)\b/i.test(answer);
  const evaluationGateCompleted = params.evaluationGateCompleted ?? policy.requiresEvaluationGate;
  const activeSectionsCompleted = params.activeSectionsCompleted ?? policy.requiresActiveSectionsCompleted;
  const score =
    criterionPoints("grammar", grammarApproved) +
    criterionPoints("vocabulary", vocabularyApproved) +
    criterionPoints("communicativeGoal", communicativeGoalApproved) +
    criterionPoints("production", productionApproved) +
    criterionPoints("personalConnection", personalConnectionApproved);
  const canApproveClass =
    evaluationGateCompleted &&
    activeSectionsCompleted &&
    score >= policy.passingScore &&
    grammarApproved &&
    vocabularyApproved &&
    communicativeGoalApproved &&
    productionApproved &&
    blockingErrors.length === 0;

  const approvalEvidence = [
    evaluationGateCompleted ? "Evaluation gate was completed." : "",
    activeSectionsCompleted ? "Required active sections were completed." : "",
    grammarApproved ? "Learner used acceptable grammar/key language for the active class." : "",
    vocabularyApproved ? "Learner used sufficient vocabulary or class-relevant wording." : "",
    communicativeGoalApproved ? "Learner met the communicative goal at a basic production level." : "",
    productionApproved ? "Learner produced enough language for evaluation." : "",
    personalConnectionApproved ? "Learner connected the answer to a realistic or personal context." : "",
  ].filter(Boolean);

  const missing = [
    !evaluationGateCompleted ? "complete the evaluation gate" : "",
    !activeSectionsCompleted ? "complete the active class sections" : "",
    !grammarApproved ? "use the target grammar or key language more clearly" : "",
    !vocabularyApproved ? "include class vocabulary or useful chunks" : "",
    !communicativeGoalApproved ? "answer the communication task more directly" : "",
    !productionApproved ? `write at least ${rubric.minSentences} complete sentence(s) and include enough class-relevant content` : "",
    ...blockingErrors,
  ].filter(Boolean);

  return {
    classId: rubric.classId,
    evaluationGateCompleted,
    activeSectionsCompleted,
    grammarApproved,
    vocabularyApproved,
    communicativeGoalApproved,
    productionApproved,
    blockingErrors,
    canApproveClass,
    approvalEvidence,
    retryPrompt: canApproveClass
      ? "Class can be approved. Close the class and advance only after the approval write succeeds."
      : `Please try again and ${missing.join("; ")}.`,
    rubric,
    scores: {
      grammar: grammarApproved ? "approved" : "needs_work",
      vocabulary: vocabularyApproved ? "approved" : "needs_work",
      communicativeGoal: communicativeGoalApproved ? "approved" : "needs_work",
      production: productionApproved ? "approved" : "needs_work",
      personalConnection: personalConnectionApproved ? "approved" : "needs_work",
    },
    score,
    evaluatorVersion: EVALUATOR_VERSION,
    policyId: policy.policyId,
  };
}

export function canWriteClassApproval(evaluation: unknown): evaluation is ClassApprovalEvaluation {
  if (!evaluation || typeof evaluation !== "object") return false;
  const candidate = evaluation as Partial<ClassApprovalEvaluation>;
  return candidate.canApproveClass === true &&
    candidate.evaluationGateCompleted === true &&
    candidate.activeSectionsCompleted === true &&
    Array.isArray(candidate.approvalEvidence) &&
    candidate.approvalEvidence.length > 0 &&
    typeof candidate.score === "number" &&
    candidate.score >= getApprovalPolicyConfig().passingScore &&
    typeof candidate.evaluatorVersion === "string" &&
    typeof candidate.policyId === "string" &&
    Array.isArray(candidate.blockingErrors) &&
    candidate.blockingErrors.length === 0;
}
