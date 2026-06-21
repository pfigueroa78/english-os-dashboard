export type CoachLearningPulseContract = {
  level: string;
  practiceCount: number;
  evidenceCount: number | null;
  evidenceTotal: number;
  focus: string;
  nextStep: string;
};

export type CoachLearnerContextContract = {
  userEmail: string;
  learnerId: string;
  savedPosition: {
    unit: string;
    lesson: string;
  };
  progressSnapshot: string;
  learningPulse: CoachLearningPulseContract;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function readableProgressValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(readableProgressValue).find(Boolean) || "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "summary",
      "text",
      "label",
      "value",
      "name",
      "title",
      "focus",
      "weakness",
      "mistake",
      "correction",
      "nextAction",
      "recommendedAction",
      "action",
      "description",
      "cefrEstimate",
      "score",
      "status",
    ];
    for (const key of preferredKeys) {
      const readable = readableProgressValue(record[key]);
      if (readable) return readable;
    }
  }
  return "";
}

function firstProgressValue(...values: unknown[]) {
  return values.map(readableProgressValue).find(Boolean) || "";
}

function arraysFromContext(data: any) {
  const context = data?.context || data || {};
  return {
    recentLogs: Array.isArray(context?.recentDailyLogs) ? context.recentDailyLogs : Array.isArray(data?.recentDailyLogs) ? data.recentDailyLogs : [],
    recentMistakes: Array.isArray(context?.recentMistakes) ? context.recentMistakes : Array.isArray(data?.recentMistakes) ? data.recentMistakes : [],
    recentProgress: Array.isArray(context?.recentProgress) ? context.recentProgress : Array.isArray(data?.recentProgress) ? data.recentProgress : [],
    activeVocabulary: Array.isArray(context?.activeVocabulary) ? context.activeVocabulary : Array.isArray(data?.activeVocabulary) ? data.activeVocabulary : [],
  };
}

function missionControlFromContext(data: any) {
  const context = data?.context || data || {};
  return context?.missionControl?.missionControl || context?.missionControl || data?.missionControl || {};
}

function userFromContext(data: any) {
  const context = data?.context || data || {};
  return context?.user || data?.user || {};
}

export function savedPositionFromLearnerContext(data: any) {
  const context = data?.context || data || {};
  const user = userFromContext(data);
  const recommended = context?.recommendedCurrentPosition || data?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || data?.currentPosition || {};
  const missionControl = missionControlFromContext(data);
  const sources = [
    {
      unit: recommended.unit || recommended.currentUnit,
      lesson: recommended.lesson || recommended.currentLesson,
    },
    {
      unit: current.unit || current.currentUnit,
      lesson: current.lesson || current.currentLesson,
    },
    {
      unit: user["Current Unit"] || user.CurrentUnit || user.unit || user.currentUnit,
      lesson: user["Current Lesson"] || user.CurrentLesson || user.lesson || user.currentLesson,
    },
    {
      unit: missionControl.currentUnit || missionControl.CurrentUnit || missionControl.unit,
      lesson: missionControl.currentLesson || missionControl.CurrentLesson || missionControl.lesson,
    },
  ];
  const pairedSource = sources.find((source) => text(source.unit));
  if (pairedSource) {
    return {
      unit: text(pairedSource.unit),
      lesson: text(pairedSource.lesson),
    };
  }

  return {
    unit: "",
    lesson: text(sources.find((source) => text(source.lesson))?.lesson),
  };
}

export function progressSnapshotFromLearnerContext(data: any) {
  const context = data?.context || data || {};
  const missionControl = missionControlFromContext(data);
  const user = userFromContext(data);
  const { recentLogs, recentMistakes, recentProgress } = arraysFromContext(data);

  const cefr = firstProgressValue(user["Current CEFR"], context.currentCEFR, missionControl.currentCEFR, missionControl.cefr);
  const lastEvaluation = firstProgressValue(missionControl.lastEvaluation, missionControl.lastEvaluationScore, context.lastEvaluation, recentProgress[0]?.cefrEstimate);
  const topMistake = firstProgressValue(missionControl.topMistake, context.topMistake, recentMistakes[0]?.mistake);

  const parts = [
    cefr ? `nivel actual ${cefr}` : "",
    lastEvaluation ? `última evidencia: ${lastEvaluation}` : "",
    recentLogs.length ? `${recentLogs.length} prácticas recientes` : "",
    topMistake ? `foco: ${topMistake}` : "",
  ].filter(Boolean);

  return parts.length ? parts.slice(0, 3).join(" · ") : "sin evaluaciones recientes disponibles";
}

export function learningPulseFromLearnerContext(data: any): CoachLearningPulseContract {
  const context = data?.context || data || {};
  const missionControl = missionControlFromContext(data);
  const user = userFromContext(data);
  const { recentLogs, recentMistakes, recentProgress, activeVocabulary } = arraysFromContext(data);

  const level = firstProgressValue(user["Current CEFR"], context.currentCEFR, missionControl.currentCEFR, missionControl.cefr, recentProgress[0]?.cefrEstimate);
  const lastEvaluation = firstProgressValue(missionControl.lastEvaluation, missionControl.lastEvaluationScore, context.lastEvaluation, recentProgress[0]?.cefrEstimate);
  const topMistake = firstProgressValue(missionControl.topMistake, context.topMistake, recentMistakes[0]?.mistake);
  const nextAction = firstProgressValue(missionControl.nextAction, context.nextRecommendedAction, context.nextAction, recentLogs[0]?.nextAction);

  const evidenceFlags = [
    Boolean(lastEvaluation),
    recentLogs.length > 0,
    recentProgress.length > 0,
    activeVocabulary.length > 0 || recentMistakes.length > 0,
  ];
  const evidenceCount = evidenceFlags.some(Boolean) ? evidenceFlags.filter(Boolean).length : null;

  return {
    level: level || "Sin nivel confirmado",
    practiceCount: recentLogs.length,
    evidenceCount,
    evidenceTotal: 4,
    focus: topMistake || nextAction || "responder con más evidencia",
    nextStep: nextAction || "producir una respuesta breve y corregible",
  };
}

export function learningPulseDetail(pulse: CoachLearningPulseContract) {
  return pulse.evidenceCount === null ? "sin evidencias" : `${pulse.evidenceCount}/${pulse.evidenceTotal}`;
}

export function toCoachLearnerContextContract(data: any, userEmail = ""): CoachLearnerContextContract {
  return {
    userEmail: text(userEmail || data?.userEmail),
    learnerId: text(data?.learnerId || userEmail || data?.userEmail),
    savedPosition: savedPositionFromLearnerContext(data),
    progressSnapshot: progressSnapshotFromLearnerContext(data),
    learningPulse: learningPulseFromLearnerContext(data),
  };
}
