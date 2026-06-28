import type { ClassIdentity } from "@/modules/coach-delivery/teachingContracts";

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
};

export type ResolvedClassProgressTurn = {
  reply: string;
  progress: CoachClassProgressState;
  repaired: boolean;
};

export function classProgressKey(email: string | null | undefined) {
  return email ? `english-os-class-progress:${email}` : "";
}

export function classRoadmapFromSections(sectionList: string) {
  const sections = String(sectionList || "")
    .split("+")
    .map((section) => section.trim())
    .filter(Boolean);
  const firstSection = sections[0] || "Starting point";
  const hasVideoStages = sections.some((section) => /before watching|while watching|after watching/i.test(section));
  const sectionSteps = sections.length === 1 && /video/i.test(firstSection)
    ? ["Before watching", "While watching", "After watching"]
    : hasVideoStages
      ? sections.filter((section) => !/^video class$/i.test(section))
      : sections;
  return [...sectionSteps, "Evaluation gate"];
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
    steps: classRoadmapFromSections(input.identity.sections),
    currentStepIndex: 0,
    completedStepIndexes: [],
    status: "awaiting_answer",
    lastApprovedStepIndex: null,
    updatedAt: input.nowIso || new Date().toISOString(),
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

export function advanceClassProgressFromReply(
  progress: CoachClassProgressState,
  reply: string,
  nowIso = new Date().toISOString(),
): CoachClassProgressState {
  const text = String(reply || "");
  if (/\b(class|unit checkpoint)\s+approved\b/i.test(text)) {
    return {
      ...progress,
      completedStepIndexes: allStepIndexes(progress),
      currentStepIndex: progress.steps.length - 1,
      status: "approved",
      lastApprovedStepIndex: progress.steps.length - 1,
      updatedAt: nowIso,
    };
  }

  if (/focused retry|one focused retry|needs reinforcement|almost there/i.test(text)) {
    return {
      ...progress,
      status: "needs_retry",
      updatedAt: nowIso,
    };
  }

  const approved = isMicroStepApproved(text);
  const currentStepIndex = progress.currentStepIndex;
  if (!approved) {
    return {
      ...progress,
      status: "awaiting_answer",
      updatedAt: nowIso,
    };
  }

  if (currentStepIndex >= progress.steps.length - 1) {
    return {
      ...progress,
      completedStepIndexes: allStepIndexes(progress),
      status: "approved",
      lastApprovedStepIndex: currentStepIndex,
      updatedAt: nowIso,
    };
  }

  const announcedNextStep = announcedStepNumber(text, "Next micro-step");
  const fallbackNextIndex = Math.min(currentStepIndex + 1, progress.steps.length - 1);
  const announcedNextIndex = announcedNextStep
    ? Math.min(Math.max(announcedNextStep - 1, 0), progress.steps.length - 1)
    : null;
  const nextIndex = announcedNextIndex !== null && announcedNextIndex > currentStepIndex
    ? announcedNextIndex
    : fallbackNextIndex;

  return {
    ...progress,
    currentStepIndex: nextIndex,
    completedStepIndexes: [...new Set([...progress.completedStepIndexes, currentStepIndex])],
    status: progress.steps[nextIndex] === "Evaluation gate" ? "evaluation_ready" : "awaiting_answer",
    lastApprovedStepIndex: currentStepIndex,
    updatedAt: nowIso,
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
  const nextProgress = advanceClassProgressFromReply(progress, reply, nowIso);

  if (nextProgress.status === "needs_retry" || nextProgress.status === "approved") {
    return { reply: enforceVideoResourceFirst(nextProgress, reply, learnerMessage), progress: nextProgress, repaired: false };
  }

  if (nextProgress.currentStepIndex > progress.currentStepIndex) {
    return repairApprovedReplyIfNeeded(progress, nextProgress, reply);
  }

  const repeatedCurrentStep = announcesStepAtOrBefore(reply, progress.currentStepIndex + 1);
  const repeatsVideoSimulation = isVideoWhileWatching(progress) && hasTeacherSimulation(reply);
  if ((repeatedCurrentStep || repeatsVideoSimulation) && isLikelyLearnerProduction(learnerMessage)) {
    const advanced = approveCurrentStep(progress, nowIso);
    return {
      reply: buildDeterministicApprovalReply(progress, advanced),
      progress: advanced,
      repaired: true,
    };
  }

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

function repairApprovedReplyIfNeeded(
  previous: CoachClassProgressState,
  next: CoachClassProgressState,
  reply: string,
): ResolvedClassProgressTurn {
  const announcedNextStep = announcedStepNumber(reply, "Next micro-step");
  const staleAnnouncement = Boolean(announcedNextStep && announcedNextStep <= previous.currentStepIndex + 1);
  const staleCurrentStep = announcesStepAtOrBefore(reply, previous.currentStepIndex + 1);
  const illegalVideoSimulation = isVideoWhileWatching(next) && hasTeacherSimulation(reply);
  if (!staleAnnouncement && !staleCurrentStep && !illegalVideoSimulation) {
    return { reply: enforceVideoResourceFirst(next, reply, ""), progress: next, repaired: false };
  }
  const approvedPart = reply.split(/Next micro-step:/i)[0].trim() || "This micro-step is approved.";
  return {
    reply: `${approvedPart}\n\n${buildCurrentStepTask(next)}`.trim(),
    progress: next,
    repaired: true,
  };
}

function buildDeterministicApprovalReply(
  previous: CoachClassProgressState,
  next: CoachClassProgressState,
) {
  return [
    "👍 Good answer. This micro-step is approved.",
    "",
    `You completed Paso ${previous.currentStepIndex + 1} de ${previous.steps.length} - ${currentStepName(previous)}.`,
    "",
    buildCurrentStepTask(next),
  ].join("\n");
}

function buildCurrentStepTask(progress: CoachClassProgressState) {
  const step = currentStepName(progress);
  const heading = `Next micro-step: Paso ${progress.currentStepIndex + 1} de ${progress.steps.length} - ${step}.`;
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
    return [
      heading,
      "",
      "Final checkpoint: answer with 3-5 short items using the target grammar, vocabulary, and one personal example. I’ll evaluate whether the class can be approved.",
    ].join("\n");
  }
  return [
    heading,
    "",
    "Continue with one short answer in English using the target language from this class. I’ll evaluate it before we move on.",
  ].join("\n");
}

function approveCurrentStep(progress: CoachClassProgressState, nowIso: string): CoachClassProgressState {
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

function enforceVideoResourceFirst(
  progress: CoachClassProgressState,
  reply: string,
  learnerMessage: string,
) {
  if (!isVideoWhileWatching(progress) || !hasTeacherSimulation(reply) || learnerRequestedFallback(learnerMessage)) {
    return reply;
  }
  return buildCurrentStepTask(progress);
}

function isMicroStepApproved(text: string) {
  return /This micro-step is approved|micro-step is approved|Paso\s+\d{1,2}\s+approved/i.test(text);
}

function announcedStepNumber(text: string, label: string) {
  return Number(new RegExp(`${label}:\\s*Paso\\s+(\\d{1,2})\\s+de`, "i").exec(text)?.[1] || 0);
}

function announcesStepAtOrBefore(text: string, oneBasedStep: number) {
  const matches = [...text.matchAll(/(?:Next micro-step:|We(?:'|’)re at|Estamos en|Paso)\s*(?:Paso\s*)?(\d{1,2})\s+de/gi)];
  return matches.some((match) => Number(match[1]) <= oneBasedStep);
}

function currentStepName(progress: CoachClassProgressState) {
  return progress.steps[progress.currentStepIndex] || "current step";
}

function isVideoWhileWatching(progress: CoachClassProgressState) {
  return /while watching/i.test(currentStepName(progress));
}

function hasTeacherSimulation(text: string) {
  return /teacher[- ]created|teacher listening input|listening simulation|not a transcript/i.test(text);
}

function learnerRequestedFallback(text: string) {
  return /can'?t open|cannot open|no puedo abrir|no abre|unavailable|not available/i.test(text);
}

function isLikelyLearnerProduction(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 8 && !/^(dame|continua|continuemos|sigue|ok|listo|empecemos)\b/i.test(text.trim());
}

function isClassProgressStatus(value: unknown): value is CoachClassProgressStatus {
  return value === "awaiting_answer" || value === "needs_retry" || value === "evaluation_ready" || value === "approved";
}

function allStepIndexes(progress: CoachClassProgressState) {
  return progress.steps.map((_, index) => index);
}
