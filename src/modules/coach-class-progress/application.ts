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
  const currentStep = progress.steps[progress.currentStepIndex] || "current step";
  const nextStep = progress.steps[progress.currentStepIndex + 1] || "";
  return [
    "CLASS PROGRESS STATE (authoritative application state):",
    `- Active class: Unit ${progress.unit}, Class ${progress.displayClass}.`,
    `- Roadmap: ${progress.steps.map((step, index) => `${index + 1}. ${step}`).join(" | ")}.`,
    `- Current step: Paso ${progress.currentStepIndex + 1} de ${progress.steps.length} — ${currentStep}.`,
    `- Completed steps: ${progress.completedStepIndexes.map((index) => `Paso ${index + 1}`).join(", ") || "none"}.`,
    nextStep ? `- If the learner answer is acceptable, approve Paso ${progress.currentStepIndex + 1} and advance to Paso ${progress.currentStepIndex + 2} — ${nextStep}.` : "- If the learner answer is acceptable, complete the evaluation/approval flow; do not ask another practice question.",
    `- If the answer has blocking errors, keep Paso ${progress.currentStepIndex + 1} and label the next task as Focused retry.`,
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

  const announcedNextStep = Number(text.match(/Next micro-step:\s*Paso\s+(\d{1,2})\s+de/i)?.[1] || 0);
  const approved = /This micro-step is approved|micro-step is approved|Paso\s+\d{1,2}\s+approved/i.test(text);
  const currentStepIndex = progress.currentStepIndex;
  const nextIndex = announcedNextStep ? Math.min(Math.max(announcedNextStep - 1, 0), progress.steps.length - 1) : currentStepIndex + 1;

  if (approved && nextIndex > currentStepIndex) {
    return {
      ...progress,
      currentStepIndex: nextIndex,
      completedStepIndexes: [...new Set([...progress.completedStepIndexes, currentStepIndex])],
      status: progress.steps[nextIndex] === "Evaluation gate" ? "evaluation_ready" : "awaiting_answer",
      lastApprovedStepIndex: currentStepIndex,
      updatedAt: nowIso,
    };
  }

  return {
    ...progress,
    status: "awaiting_answer",
    updatedAt: nowIso,
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

function isClassProgressStatus(value: unknown): value is CoachClassProgressStatus {
  return value === "awaiting_answer" || value === "needs_retry" || value === "evaluation_ready" || value === "approved";
}

function allStepIndexes(progress: CoachClassProgressState) {
  return progress.steps.map((_, index) => index);
}
