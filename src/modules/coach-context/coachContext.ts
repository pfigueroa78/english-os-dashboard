export type CoachLearningPulse = {
  level: string;
  practiceCount: number;
  evidenceCount: number | null;
  evidenceTotal: number;
  focus: string;
  nextStep: string;
};

export type CoachSavedPosition = {
  unit: string;
  lesson: string;
  classNumber: number | null;
};

export type CoachInitialMessage = {
  role: "coach";
  content: string;
};

export function getLearnerDisplayName(user: any) {
  const candidate = user?.firstName || user?.fullName || user?.username || "";
  return String(candidate).trim();
}

export function extractUnitNumber(value: string) {
  const match = String(value || "").match(/(\d{1,2})/);
  return match?.[1] || "";
}

export function unitLabel(value: string) {
  const number = extractUnitNumber(value);
  return number ? `Unit ${number}` : value || "Current unit";
}

export function normalizeUnitValue(value: string) {
  return unitLabel(value);
}

export function buildTodayClassMessage(unit: string, lesson: string, learnerName = "") {
  return buildInitialCoachMessage(unit, lesson, "", learnerName);
}

export function buildInitialCoachMessage(unit: string, lesson: string, progressSnapshot = "", learnerName = "") {
  const greeting = learnerName
    ? `Hola, ${learnerName}. Soy tu profesor de English OS y hoy vamos a trabajar paso a paso.`
    : "Hola. Soy tu profesor de English OS y hoy vamos a trabajar paso a paso.";

  return [
    greeting,
    "",
    `Unidad activa: ${unitLabel(unit)}.`,
    "",
    `Clase / lección actual: ${lesson || "Clase guiada de English OS"}.`,
    progressSnapshot ? `Avance: ${progressSnapshot}.` : "",
    "",
    "Puedes empezar la explicación, pedir una pista, practicar gramática o responder la evaluación pendiente. Yo mantengo el avance bloqueado hasta que la evaluación quede aprobada.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

export function buildInitialCoachMessages(params: {
  e2eDemo: boolean;
  demoUnit: string;
  demoLesson: string;
  demoLearnerName: string;
}): CoachInitialMessage[] {
  return [
    {
      role: "coach",
      content: params.e2eDemo
        ? buildTodayClassMessage(params.demoUnit, params.demoLesson, params.demoLearnerName)
        : "Loading your English OS class plan...",
    },
  ];
}

export function getSavedPosition(data: any): CoachSavedPosition {
  const context = data?.context || {};
  const user = context?.user || data?.user || {};
  const recommended = context?.recommendedCurrentPosition || data?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || data?.currentPosition || {};
  const learningState = context?.learningState || data?.learningState || {};
  const currentClassIndex = context?.currentClassIndex || data?.currentClassIndex || {};
  const missionControl = context?.missionControl || data?.missionControl || context || {};
  const sources = [
    {
      unit: learningState.currentUnit || currentClassIndex.unit || learningState.unit,
      lesson: currentClassIndex.lesson || learningState.currentLesson || learningState.lesson || (learningState.currentClass ? `Class ${learningState.currentClass}` : ""),
      classNumber: learningState.currentClass || currentClassIndex.classNumber,
    },
    {
      unit: recommended.unit || recommended.currentUnit,
      lesson: recommended.lesson || recommended.currentLesson,
      classNumber: recommended.currentClass || recommended.classNumber,
    },
    {
      unit: current.unit || current.currentUnit,
      lesson: current.lesson || current.currentLesson,
      classNumber: current.currentClass || current.classNumber,
    },
    {
      unit: user["Current Unit"] || user.CurrentUnit || user.unit || user.currentUnit,
      lesson: user["Current Lesson"] || user.CurrentLesson || user.lesson || user.currentLesson,
      classNumber: user["Current Class"] || user.CurrentClass,
    },
    {
      unit: missionControl.currentUnit || missionControl.CurrentUnit || missionControl.unit,
      lesson: missionControl.currentLesson || missionControl.CurrentLesson || missionControl.lesson,
      classNumber: missionControl.currentClass || missionControl.classNumber,
    },
  ];
  const pairedSource = sources.find((source) => String(source.unit || "").trim());
  if (pairedSource) {
    return {
      unit: String(pairedSource.unit || "").trim(),
      lesson: String(pairedSource.lesson || "").trim(),
      classNumber: Number(pairedSource.classNumber || 0) || null,
    };
  }

  return {
    unit: "",
    lesson: String(sources.find((source) => String(source.lesson || "").trim())?.lesson || "").trim(),
    classNumber: null,
  };
}

export function readableProgressValue(value: unknown): string {
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

export function firstProgressValue(...values: unknown[]) {
  return values.map(readableProgressValue).find(Boolean) || "";
}

export function buildProgressSnapshot(data: any) {
  const context = data?.context || data || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || data?.missionControl || {};
  const user = context?.user || data?.user || {};
  const recentLogs = Array.isArray(context?.recentDailyLogs) ? context.recentDailyLogs : Array.isArray(data?.recentDailyLogs) ? data.recentDailyLogs : [];
  const recentMistakes = Array.isArray(context?.recentMistakes) ? context.recentMistakes : Array.isArray(data?.recentMistakes) ? data.recentMistakes : [];
  const recentProgress = Array.isArray(context?.recentProgress) ? context.recentProgress : Array.isArray(data?.recentProgress) ? data.recentProgress : [];

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

export function buildLearningPulse(data: any): CoachLearningPulse {
  const context = data?.context || data || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || data?.missionControl || {};
  const user = context?.user || data?.user || {};
  const recentLogs = Array.isArray(context?.recentDailyLogs) ? context.recentDailyLogs : Array.isArray(data?.recentDailyLogs) ? data.recentDailyLogs : [];
  const recentMistakes = Array.isArray(context?.recentMistakes) ? context.recentMistakes : Array.isArray(data?.recentMistakes) ? data.recentMistakes : [];
  const recentProgress = Array.isArray(context?.recentProgress) ? context.recentProgress : Array.isArray(data?.recentProgress) ? data.recentProgress : [];
  const activeVocabulary = Array.isArray(context?.activeVocabulary) ? context.activeVocabulary : Array.isArray(data?.activeVocabulary) ? data.activeVocabulary : [];

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

export function learningPulseDetail(pulse: CoachLearningPulse) {
  return pulse.evidenceCount === null ? "sin evidencias" : `${pulse.evidenceCount}/${pulse.evidenceTotal}`;
}
