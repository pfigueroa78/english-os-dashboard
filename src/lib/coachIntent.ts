export function normalizeCoachMessage(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRequestedUnitNumber(message: string): number | null {
  const match = normalizeCoachMessage(message).match(/(?:unidad|unit)\s+(\d{1,2})/);
  return match?.[1] ? Number(match[1]) : null;
}

export function extractRequestedClassNumber(message: string): number | null {
  const match = normalizeCoachMessage(message).match(/(?:clase|class|lesson)\s+(\d{1,2})/);
  return match?.[1] ? Number(match[1]) : null;
}

export function hasExplicitClassCoordinates(message: string) {
  return Boolean(extractRequestedUnitNumber(message) && extractRequestedClassNumber(message));
}

export type CoachIntentKind =
  | "specific_class"
  | "active_class"
  | "review"
  | "grammar_guide"
  | "vocabulary_guide"
  | "correction"
  | "speaking_practice"
  | "hint"
  | "general";

export type CoachIntent = {
  kind: CoachIntentKind;
  confidence: "high" | "medium" | "low";
  unit: number | null;
  classNumber: number | null;
  reasons: string[];
};

function hasAny(normalized: string, pattern: RegExp) {
  return pattern.test(normalized);
}

function inferActiveClassRequest(normalized: string) {
  const reasons: string[] = [];
  const hasClassWord = hasAny(normalized, /\b(clase|class|lesson|sesion|session)\b/);
  const classModeRequest = hasAny(normalized, /\b(?:modo clase|modo de clase|class mode|lesson mode)\b/);
  const studyAction = hasAny(normalized, /\b(dame|dar|quiero|quisiera|vamos|dale|toca|abre|abrir|empez\w*|empiez\w*|empec\w*|inici\w*|comenz\w*|arranc\w*|arranqu\w*|contin\w*|sig\w*|retom\w*|ensename|ensenar|estudiar|estudiemos|trabajar|trabajemos|practicar|practiquemos|start|open|continue|resume|teach|study|practice|work)\b/);
  const currentSignal = hasAny(normalized, /\b(mi|mis|actual|activa|hoy|guardada|posicion|posicionada|donde|voy|quede|quedamos|today|current|saved)\b/);
  const classObject = hasClassWord || hasAny(normalized, /\b(lo de hoy|que toca|plan de hoy|sesion de hoy|clase de hoy|today lesson|today s lesson|current lesson)\b/);
  const resumeSignal = hasAny(normalized, /\b(continua|continuar|continuemos|sigamos|seguir|retoma|retomar|resume|continue)\b.*\b(donde|voy|quede|quedamos|actual|hoy|current|saved)\b/);
  const shortStarter = normalized.split(" ").length <= 5 && hasAny(normalized, /\b(vamos|dale|empez\w*|empiez\w*|empec\w*|arranc\w*|arranqu\w*|comenz\w*|inici\w*|start|continue|resume)\b/);
  const standaloneStudyStarter = normalized.split(" ").length <= 6 && hasAny(normalized, /\b(quiero|quisiera|vamos|let'?s|lets)\b.*\b(estudiar|aprender|practicar|trabajar|study|learn|practice|work)\b/);

  if (classModeRequest) reasons.push("class-mode wording");
  if (hasClassWord && (studyAction || currentSignal)) reasons.push("class noun with study/current signal");
  if (classObject && studyAction) reasons.push("study action with class/today object");
  if (resumeSignal) reasons.push("resume-current-class wording");
  if (shortStarter) reasons.push("short classroom starter");
  if (standaloneStudyStarter) reasons.push("standalone study starter");

  return {
    matches: classModeRequest || (hasClassWord && (studyAction || currentSignal)) || (classObject && studyAction) || resumeSignal || shortStarter || standaloneStudyStarter,
    reasons,
  };
}

export function classifyCoachIntent(message: string): CoachIntent {
  const normalized = normalizeCoachMessage(message);
  const unit = extractRequestedUnitNumber(message);
  const classNumber = extractRequestedClassNumber(message);
  const reasons: string[] = [];

  const asksReview = hasAny(normalized, /\b(repaso|repasar|review|checkpoint|refuerzo|reforzar|reinforcement)\b/);
  const asksGrammarGuide = hasAny(normalized, /\b(guia|guide)\b/) && hasAny(normalized, /\b(gramatica|grammar)\b/);
  const asksVocabularyGuide = hasAny(normalized, /\b(guia|guide)\b/) && hasAny(normalized, /\b(vocabulario|vocabulary)\b/);
  const asksUnit = hasAny(normalized, /\b(unidad|unit)\b/);
  const asksCorrection = hasAny(normalized, /\b(corrige|corregir|correccion|correction|evalua|evaluar|evaluate|feedback)\b/);
  const asksSpeaking = hasAny(normalized, /\b(speaking|hablar|conversacion|conversation|role play|pronunciacion|pronunciation)\b/);
  const asksHint = hasAny(normalized, /\b(pista|hint|ayuda corta|help me answer)\b/);

  if (asksReview && (asksUnit || unit)) {
    return { kind: "review", confidence: "high", unit, classNumber, reasons: ["review wording with unit"] };
  }

  if (asksGrammarGuide && (asksUnit || unit)) {
    return { kind: "grammar_guide", confidence: "high", unit, classNumber, reasons: ["grammar guide wording with unit"] };
  }

  if (asksVocabularyGuide && (asksUnit || unit)) {
    return { kind: "vocabulary_guide", confidence: "high", unit, classNumber, reasons: ["vocabulary guide wording with unit"] };
  }

  if (unit && classNumber) {
    return { kind: "specific_class", confidence: "high", unit, classNumber, reasons: ["explicit unit and class coordinates"] };
  }

  const activeClass = inferActiveClassRequest(normalized);
  if (activeClass.matches) {
    return { kind: "active_class", confidence: activeClass.reasons.includes("short classroom starter") ? "medium" : "high", unit, classNumber, reasons: activeClass.reasons };
  }

  if (asksHint) return { kind: "hint", confidence: "medium", unit, classNumber, reasons: ["hint wording"] };
  if (asksCorrection) return { kind: "correction", confidence: "medium", unit, classNumber, reasons: ["correction/evaluation wording"] };
  if (asksSpeaking) return { kind: "speaking_practice", confidence: "medium", unit, classNumber, reasons: ["speaking-practice wording"] };

  return { kind: "general", confidence: "low", unit, classNumber, reasons };
}

export function isActiveClassRequest(message: string) {
  return classifyCoachIntent(message).kind === "active_class";
}

export function isReviewIntent(message: string) {
  return classifyCoachIntent(message).kind === "review";
}

export function unitGuideIntentKind(message: string): "grammar" | "vocabulary" | null {
  const intent = classifyCoachIntent(message).kind;
  if (intent === "grammar_guide") return "grammar";
  if (intent === "vocabulary_guide") return "vocabulary";
  return null;
}

export function isGiveClassQuestion(message: string) {
  const intent = classifyCoachIntent(message).kind;
  return intent === "specific_class" || intent === "active_class";
}
