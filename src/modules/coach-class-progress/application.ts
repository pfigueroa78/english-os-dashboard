import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";
import { lessonBlockRoadmap } from "@/modules/coach-delivery/pedagogicalDeliveryPolicy";
import {
  evaluateClassApproval,
  type ClassApprovalEvaluation,
} from "@/modules/coach-approval/application";

export type CoachClassProgressStatus =
  | "awaiting_answer"
  | "needs_retry"
  | "evaluation_ready"
  | "approved";

export type CoachClassProgressState = {
  unit: number;
  localClass: number;
  displayClass: number;
  lessonTitle: string;
  steps: string[];
  currentStepIndex: number;
  completedStepIndexes: number[];
  status: CoachClassProgressStatus;
  lastApprovedStepIndex: number | null;
  updatedAt: string;
  evaluationProfile?: CoachClassEvaluationProfile;
};

export type CoachClassEvaluationProfile = {
  grammarFocus?: string;
  vocabularyFocus?: string;
  functions?: string;
  targetStructures?: string;
  expectedProduction?: string;
  skillFocus?: string;
};

export type ResolvedClassProgressTurn = {
  reply: string;
  progress: CoachClassProgressState;
  repaired: boolean;
  approvalEvaluation?: ClassApprovalEvaluation;
};

export type PreModelClassProgressTurn = ResolvedClassProgressTurn & {
  source: "structured_evaluation_gate_event" | "structured_learning_block_event";
};

export type ClassProgressEvent =
  | {
      type: "learning_step_evaluated";
      approved: boolean;
      evidence: string[];
      retryPrompt?: string;
    }
  | {
      type: "evaluation_gate_evaluated";
      approved: boolean;
      evaluation: ClassApprovalEvaluation;
    };

export function classProgressKey(email: string | null | undefined) {
  return email ? `english-os-class-progress:${email}` : "";
}

export function classRoadmapFromSections(sectionList: string) {
  return lessonBlockRoadmap({
    lessonTitle: "",
    bookPages: "",
    pdfPages: "",
    sections: sectionList,
    skillFocus: "",
    grammarFocus: "",
    vocabularyFocus: "",
    functions: "",
    targetStructures: "",
    expectedProduction: "",
  });
}

export function createClassProgress(input: {
  unit: number;
  localClass: number;
  displayClass?: number | null;
  identity: ClassIdentity;
  nowIso?: string;
}): CoachClassProgressState {
  return {
    unit: input.unit,
    localClass: input.localClass,
    displayClass: input.displayClass || input.localClass,
    lessonTitle: input.identity.lessonTitle || "Class session",
    steps: lessonBlockRoadmap(input.identity, input.localClass),
    currentStepIndex: 0,
    completedStepIndexes: [],
    status: "awaiting_answer",
    lastApprovedStepIndex: null,
    updatedAt: input.nowIso || new Date().toISOString(),
    evaluationProfile: evaluationProfileFromIdentity(input.identity),
  };
}

export function enrichClassProgress(
  progress: CoachClassProgressState,
  identity: ClassIdentity,
): CoachClassProgressState {
  const evaluationProfile = evaluationProfileFromIdentity(identity);
  if (!Object.values(evaluationProfile).some(Boolean)) return progress;
  return {
    ...progress,
    lessonTitle: progress.lessonTitle || identity.lessonTitle || "Class session",
    evaluationProfile: {
      ...evaluationProfile,
      ...progress.evaluationProfile,
    },
  };
}

export function isSameClassProgress(
  progress: CoachClassProgressState | null | undefined,
  target: { unit: number; localClass: number; displayClass?: number | null },
) {
  return Boolean(
    progress &&
    progress.unit === target.unit &&
    progress.localClass === target.localClass &&
    progress.displayClass === (target.displayClass || target.localClass),
  );
}

export function sanitizeClassProgress(value: unknown): CoachClassProgressState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<CoachClassProgressState>;
  if (!Number.isFinite(candidate.unit) || !Number.isFinite(candidate.localClass)) return null;
  if (!Array.isArray(candidate.steps) || candidate.steps.some((step) => typeof step !== "string")) return null;
  const currentStepIndex = Number(candidate.currentStepIndex);
  if (!Number.isInteger(currentStepIndex) || currentStepIndex < 0 || currentStepIndex >= candidate.steps.length) return null;
  const completedStepIndexes = Array.isArray(candidate.completedStepIndexes)
    ? candidate.completedStepIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < candidate.steps!.length)
    : [];
  return {
    unit: Number(candidate.unit),
    localClass: Number(candidate.localClass),
    displayClass: Number(candidate.displayClass || candidate.localClass),
    lessonTitle: String(candidate.lessonTitle || "Class session"),
    steps: candidate.steps,
    currentStepIndex,
    completedStepIndexes: [...new Set(completedStepIndexes)],
    status: isClassProgressStatus(candidate.status) ? candidate.status : "awaiting_answer",
    lastApprovedStepIndex: Number.isInteger(candidate.lastApprovedStepIndex) ? Number(candidate.lastApprovedStepIndex) : null,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    evaluationProfile: sanitizeEvaluationProfile(candidate.evaluationProfile),
  };
}

export function buildClassProgressInstruction(progress: CoachClassProgressState) {
  const currentStep = currentStepName(progress);
  const nextStep = progress.steps[progress.currentStepIndex + 1] || "";
  return [
    "CLASS PROGRESS STATE (authoritative application state):",
    `- Active class: Unit ${progress.unit}, Class ${progress.displayClass}.`,
    `- Roadmap: ${progress.steps.map((step, index) => `${index + 1}. ${step}`).join(" | ")}.`,
    `- Current step: Paso ${progress.currentStepIndex + 1} de ${progress.steps.length} - ${currentStep}.`,
    `- Completed steps: ${progress.completedStepIndexes.map((index) => `Paso ${index + 1}`).join(", ") || "none"}.`,
    nextStep
      ? `- If the learner answer is acceptable, approve Paso ${progress.currentStepIndex + 1} and advance to Paso ${progress.currentStepIndex + 2} - ${nextStep}.`
      : "- If the learner answer is acceptable, complete the evaluation/approval flow; do not ask another practice question.",
    `- If the answer has blocking errors, keep Paso ${progress.currentStepIndex + 1} and label the next task as Focused retry.`,
    "- For Video Class / While watching, do not create a teacher listening simulation by default. First ask the learner to use the visible video/resource. Use a fallback simulation only if the learner says the resource is unavailable.",
    "- Never open the same numbered step again after approving it.",
  ].filter(Boolean).join("\n");
}

export function applyClassProgressEvent(
  progress: CoachClassProgressState,
  event: ClassProgressEvent,
  nowIso = new Date().toISOString(),
): ResolvedClassProgressTurn {
  if (event.type === "evaluation_gate_evaluated") {
    if (event.approved) {
      const approved = approveClassProgress(progress, nowIso);
      return {
        reply: buildClassApprovedReply(progress, event.evaluation),
        progress: approved,
        repaired: true,
        approvalEvaluation: event.evaluation,
      };
    }
    return {
      reply: buildFocusedRetryReply(event.evaluation),
      progress: {
        ...progress,
        status: "needs_retry",
        updatedAt: nowIso,
      },
      repaired: true,
      approvalEvaluation: event.evaluation,
    };
  }

  if (event.approved) {
    const advanced = approveCurrentStep(progress, nowIso);
    return {
      reply: buildStructuredStepApprovalReply(progress, advanced, event.evidence),
      progress: advanced,
      repaired: true,
    };
  }

  return {
    reply: buildStructuredStepRetryReply(progress, event.retryPrompt || "Use the class language more clearly before we move on."),
    progress: {
      ...progress,
      status: "needs_retry",
      updatedAt: nowIso,
    },
    repaired: true,
  };
}

export function resolveClassProgressTurn(params: {
  progress: CoachClassProgressState;
  learnerMessage: string;
  reply: string;
  nowIso?: string;
}): ResolvedClassProgressTurn {
  const progress = params.progress;
  const reply = String(params.reply || "").trim();
  const learnerMessage = String(params.learnerMessage || "").trim();
  const nowIso = params.nowIso || new Date().toISOString();

  if (isEvaluationGateStep(progress) && isLikelyLearnerProduction(learnerMessage)) {
    const evaluation = evaluateClassApproval({
      answer: learnerMessage,
      classPack: approvalRubricSourceFromProgress(progress),
      evaluationGateCompleted: true,
      activeSectionsCompleted: previousStepsCompleted(progress),
    });
    if (evaluation.canApproveClass) {
      const approved = approveClassProgress(progress, nowIso);
      return {
        reply: buildClassApprovedReply(progress, evaluation),
        progress: approved,
        repaired: true,
        approvalEvaluation: evaluation,
      };
    }
  }

  const learningStepEvent = evaluateLearningStepEvent(progress, learnerMessage);
  if (learningStepEvent) return applyClassProgressEvent(progress, learningStepEvent, nowIso);

  const nextProgress = {
    ...progress,
    status: "awaiting_answer" as const,
    updatedAt: nowIso,
  };

  if (isVideoWhileWatching(progress) && hasTeacherSimulation(reply) && !learnerRequestedFallback(learnerMessage)) {
    return {
      reply: buildCurrentStepTask(progress),
      progress: {
        ...progress,
        status: "awaiting_answer",
        updatedAt: nowIso,
      },
      repaired: true,
    };
  }

  return { reply, progress: nextProgress, repaired: false };
}

export function resolveClassProgressBeforeModel(params: {
  progress: CoachClassProgressState;
  learnerMessage: string;
  recentCoachText?: string;
  nowIso?: string;
}): PreModelClassProgressTurn | null {
  const progress = params.progress;
  const learnerMessage = String(params.learnerMessage || "").trim();
  const nowIso = params.nowIso || new Date().toISOString();
  const recentCoachText = String(params.recentCoachText || "");

  if (!isLikelyLearnerProduction(learnerMessage)) return null;

  const learnerIsAnsweringVisibleGate =
    isEvaluationGateStep(progress) ||
    /Evaluation gate|Final checkpoint|complete these items|class is approved|approve this class|Send your answers/i.test(recentCoachText);

  if (learnerIsAnsweringVisibleGate) {
    const gateProgress = isEvaluationGateStep(progress)
      ? progress
      : {
          ...progress,
          currentStepIndex: progress.steps.length - 1,
          completedStepIndexes: allStepIndexes(progress).filter((index) => index < progress.steps.length - 1),
          status: "evaluation_ready" as const,
          updatedAt: nowIso,
        };
    const evaluation = evaluateClassApproval({
      answer: learnerMessage,
      classPack: approvalRubricSourceFromProgress(gateProgress),
      evaluationGateCompleted: true,
      activeSectionsCompleted: true,
    });
    const event: ClassProgressEvent = {
      type: "evaluation_gate_evaluated",
      approved: evaluation.canApproveClass,
      evaluation,
    };
    return {
      ...applyClassProgressEvent(gateProgress, event, nowIso),
      source: "structured_evaluation_gate_event",
    };
  }

  const event = evaluateLearningStepEvent(progress, learnerMessage);
  if (!event) return null;
  return {
    ...applyClassProgressEvent(progress, event, nowIso),
    source: "structured_learning_block_event",
  };
}

export function loadStoredClassProgress(
  storage: Pick<Storage, "getItem" | "removeItem">,
  storageKey: string,
) {
  if (!storageKey) return null;
  const raw = storage.getItem(storageKey);
  if (!raw) return null;
  try {
    return sanitizeClassProgress(JSON.parse(raw));
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function saveStoredClassProgress(
  storage: Pick<Storage, "setItem" | "removeItem">,
  storageKey: string,
  progress: CoachClassProgressState | null,
) {
  if (!storageKey) return;
  if (!progress) {
    storage.removeItem(storageKey);
    return;
  }
  storage.setItem(storageKey, JSON.stringify(progress));
}

function buildStructuredStepApprovalReply(
  previous: CoachClassProgressState,
  next: CoachClassProgressState,
  evidence: string[],
) {
  return [
    "👍 Good answer. This learning block is approved.",
    "",
    `You completed Paso ${previous.currentStepIndex + 1} de ${previous.steps.length} - ${currentStepName(previous)}.`,
    evidence.length ? `Evidence: ${evidence.slice(0, 2).join("; ")}.` : "",
    "",
    buildCurrentStepTask(next),
  ].filter(Boolean).join("\n");
}

function buildStructuredStepRetryReply(progress: CoachClassProgressState, retryPrompt: string) {
  return [
    "Almost there. Let's strengthen this before moving on.",
    "",
    `Focused retry for Paso ${progress.currentStepIndex + 1} de ${progress.steps.length} - ${currentStepName(progress)}:`,
    retryPrompt,
    "",
    "Send only the improved answer.",
  ].join("\n");
}

function buildCurrentStepTask(progress: CoachClassProgressState) {
  const step = currentStepName(progress);
  const heading = `Next block: Paso ${progress.currentStepIndex + 1} de ${progress.steps.length} - ${step}.`;
  if (/while watching/i.test(step)) {
    return [
      heading,
      "",
      "Open the video or class resource if it is available in the materials panel. While you watch, identify:",
      "1. the main idea, and",
      "2. one useful word, phrase, or time clause from the unit.",
      "",
      "If you cannot open the video, write: \"I can't open the video\" and I’ll use a short fallback practice.",
    ].join("\n");
  }
  if (/while\/after watching/i.test(step)) {
    return [
      heading,
      "",
      "Open the video or class resource if it is available. If you cannot open the video, say so and I will use a short fallback.",
      "",
      "Answer in 3-4 sentences:",
      "1. summarize the main idea,",
      "2. mention one useful word, chunk, or structure, and",
      "3. connect the topic to your own routine, energy, or productivity.",
    ].join("\n");
  }
  if (/learn & practice/i.test(step)) {
    return [
      heading,
      "",
      "Use the language from the opening block in one integrated answer.",
      "Write 3-5 sentences and include:",
      "1. one target structure,",
      "2. two useful vocabulary items or chunks, and",
      "3. one personal or professional example.",
    ].join("\n");
  }
  if (/production/i.test(step)) {
    return [
      heading,
      "",
      "Now turn the class language into a practical speaking or writing response.",
      "Write 4-6 lines in English. Keep one clear situation, use the target language, and add one reason or example.",
    ].join("\n");
  }
  if (/integrated checkpoint/i.test(step)) {
    return [
      heading,
      "",
      "Write one integrated checkpoint answer in English.",
      "Include the unit grammar, useful vocabulary, and one personal or professional example.",
      "Aim for 4-6 short sentences.",
    ].join("\n");
  }
  if (/after watching/i.test(step)) {
    return [
      heading,
      "",
      "Now react to the video topic in English. Write 2-3 sentences:",
      "1. summarize the main idea, and",
      "2. connect it to your own routine, energy, or productivity.",
    ].join("\n");
  }
  if (/speaking|discussion|role play/i.test(step)) {
    return [
      heading,
      "",
      "Use the lesson language in a short spoken-style answer. Write 3-4 lines and include one useful chunk from the class.",
    ].join("\n");
  }
  if (/evaluation gate|checkpoint/i.test(step)) {
    return buildEvaluationGateTask(progress, heading);
  }
  return [
    heading,
    "",
    "Continue with one short answer in English using the target language from this class. I’ll evaluate it before we move on.",
  ].join("\n");
}

function approveCurrentStep(progress: CoachClassProgressState, nowIso: string): CoachClassProgressState {
  if (progress.currentStepIndex >= progress.steps.length - 1) {
    return approveClassProgress(progress, nowIso);
  }
  const nextIndex = Math.min(progress.currentStepIndex + 1, progress.steps.length - 1);
  return {
    ...progress,
    currentStepIndex: nextIndex,
    completedStepIndexes: [...new Set([...progress.completedStepIndexes, progress.currentStepIndex])],
    status: progress.steps[nextIndex] === "Evaluation gate" ? "evaluation_ready" : "awaiting_answer",
    lastApprovedStepIndex: progress.currentStepIndex,
    updatedAt: nowIso,
  };
}

function approveClassProgress(progress: CoachClassProgressState, nowIso: string): CoachClassProgressState {
  return {
    ...progress,
    currentStepIndex: progress.steps.length - 1,
    completedStepIndexes: allStepIndexes(progress),
    status: "approved",
    lastApprovedStepIndex: progress.steps.length - 1,
    updatedAt: nowIso,
  };
}

function buildEvaluationGateTask(progress: CoachClassProgressState, heading: string) {
  const profile = progress.evaluationProfile || {};
  const structures = firstUsefulItems(profile.targetStructures, 3);
  const vocabulary = firstUsefulItems(profile.vocabularyFocus, 5);
  const functions = profile.functions || profile.skillFocus || "show you can use the class language for the communication goal";
  const production = profile.expectedProduction || "produce a short, clear answer connected to the class topic";

  return [
    heading,
    "",
    "Final checkpoint: complete these items so I can decide whether the class is approved.",
    "",
    "1. Main idea: summarize the class/video topic in one sentence.",
    `2. Target language: use ${structures.length ? structures.join(" / ") : "one structure from this class"} in one sentence.`,
    `3. Vocabulary: use ${vocabulary.length ? vocabulary.join(", ") : "two useful chunks from this class"} naturally.`,
    `4. Personal connection: ${production}.`,
    `5. Communication goal: ${functions}.`,
    "",
    "Write 4-6 short sentences in English. I’ll evaluate accuracy, vocabulary, communication goal, and whether this class can be approved.",
  ].join("\n");
}

function buildClassApprovedReply(
  progress: CoachClassProgressState,
  evaluation: ClassApprovalEvaluation,
) {
  const isUnitCheckpoint = progress.localClass === 7;
  const evidence = evaluation.approvalEvidence.slice(0, 4);
  return [
    "👍 Good answer. Evaluation gate completed.",
    "",
    isUnitCheckpoint
      ? `Unit ${progress.unit} checkpoint approved.`
      : `Class ${progress.displayClass} approved.`,
    "",
    "Class approved.",
    "",
    "Short recap: You completed the required class roadmap and used the target language for this lesson.",
    `Main achievement: ${evidence[0] || "You produced enough clear English for this class."}`,
    `Priority correction: ${evaluation.blockingErrors[0] || "Keep expanding your answers with one clear reason or example."}`,
    "",
    isUnitCheckpoint
      ? "Next action: you can ask for the next unit or review your weakest point from this unit."
      : "Next action: you can ask for the next class or review this class briefly.",
  ].join("\n");
}

function buildFocusedRetryReply(evaluation: ClassApprovalEvaluation) {
  return [
    "Almost there. I cannot approve the class yet.",
    "",
    "Focused retry:",
    evaluation.retryPrompt,
    "",
    "Send only the corrected answer. I will evaluate this same checkpoint again.",
  ].join("\n");
}

function approvalRubricSourceFromProgress(progress: CoachClassProgressState) {
  const profile = progress.evaluationProfile || {};
  return [
    `Unit ${progress.unit} Class ${progress.displayClass}`,
    `Lesson type: ${progress.lessonTitle}`,
    `Active class grammar focus: ${profile.grammarFocus || ""}`,
    `Active class vocabulary focus: ${profile.vocabularyFocus || ""}`,
    `Active class target structures: ${profile.targetStructures || ""}`,
    `Active class skill focus: ${profile.skillFocus || ""}`,
    `Expected learner production: ${profile.expectedProduction || ""}`,
    `Class sections: ${progress.steps.join(" + ")}`,
    `Functions: ${profile.functions || ""}`,
  ];
}

function evaluateLearningStepEvent(progress: CoachClassProgressState, learnerMessage: string): ClassProgressEvent | null {
  if (isEvaluationGateStep(progress)) return null;
  if (isCommandLikeMessage(learnerMessage)) return null;
  const evaluation = evaluateClassApproval({
    answer: learnerMessage,
    classPack: approvalRubricSourceFromProgress(progress),
    evaluationGateCompleted: true,
    activeSectionsCompleted: true,
  });
  const approved =
    evaluation.blockingErrors.length === 0 &&
    evaluation.scores.production === "approved" &&
    evaluation.score >= 6 &&
    (evaluation.scores.grammar === "approved" || evaluation.scores.vocabulary === "approved");

  return {
    type: "learning_step_evaluated",
    approved,
    evidence: evaluation.approvalEvidence,
    retryPrompt: approved ? "" : evaluation.retryPrompt,
  };
}

function previousStepsCompleted(progress: CoachClassProgressState) {
  const required = progress.steps
    .map((_, index) => index)
    .filter((index) => index < progress.currentStepIndex);
  return required.every((index) => progress.completedStepIndexes.includes(index));
}

function firstUsefulItems(value: string | undefined, limit: number) {
  return String(value || "")
    .split(/;|,|\+/)
    .map((item) => item.trim())
    .filter((item) => item && !/^unit\s+\d+\s+review/i.test(item))
    .slice(0, limit);
}

function evaluationProfileFromIdentity(identity: ClassIdentity): CoachClassEvaluationProfile {
  return {
    grammarFocus: identity.grammarFocus,
    vocabularyFocus: identity.vocabularyFocus,
    functions: identity.functions,
    targetStructures: identity.targetStructures,
    expectedProduction: identity.expectedProduction,
    skillFocus: identity.skillFocus,
  };
}

function sanitizeEvaluationProfile(value: unknown): CoachClassEvaluationProfile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<CoachClassEvaluationProfile>;
  const profile: CoachClassEvaluationProfile = {};
  for (const key of ["grammarFocus", "vocabularyFocus", "functions", "targetStructures", "expectedProduction", "skillFocus"] as const) {
    if (typeof candidate[key] === "string" && candidate[key]!.trim()) {
      profile[key] = candidate[key]!.trim();
    }
  }
  return Object.keys(profile).length ? profile : undefined;
}

function currentStepName(progress: CoachClassProgressState) {
  return progress.steps[progress.currentStepIndex] || "current step";
}

function isVideoWhileWatching(progress: CoachClassProgressState) {
  return /while(?:\/after)? watching/i.test(currentStepName(progress));
}

function hasTeacherSimulation(text: string) {
  return /teacher[- ]created|teacher listening input|listening simulation|not a transcript/i.test(text);
}

function learnerRequestedFallback(text: string) {
  return /can'?t open|cannot open|no puedo abrir|no abre|unavailable|not available/i.test(text);
}

function isEvaluationGateStep(progress: CoachClassProgressState) {
  return /evaluation gate|checkpoint/i.test(currentStepName(progress)) || progress.status === "evaluation_ready";
}

function isLikelyLearnerProduction(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 8 && !/^(dame|continua|continuemos|sigue|ok|listo|empecemos)\b/i.test(text.trim());
}

function isCommandLikeMessage(text: string) {
  return /^(dame|continua|continuemos|sigue|ok|listo|empecemos|start|continue|next)\b/i.test(String(text || "").trim());
}

function isClassProgressStatus(value: unknown): value is CoachClassProgressStatus {
  return value === "awaiting_answer" || value === "needs_retry" || value === "evaluation_ready" || value === "approved";
}

function allStepIndexes(progress: CoachClassProgressState) {
  return progress.steps.map((_, index) => index);
}
