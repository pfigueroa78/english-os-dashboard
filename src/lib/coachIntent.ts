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
  const match = normalizeCoachMessage(message).match(/(?:clase|class)\s+(\d{1,2})/);
  return match?.[1] ? Number(match[1]) : null;
}

export function hasExplicitClassCoordinates(message: string) {
  return Boolean(extractRequestedUnitNumber(message) && extractRequestedClassNumber(message));
}

export function isActiveClassRequest(message: string) {
  const normalized = normalizeCoachMessage(message);
  const reviewRequest = /\b(repaso|repasar|review)\b/.test(normalized);
  if (reviewRequest) return false;

  const hasClassWord = /\b(clase|class|lesson)\b/.test(normalized);
  const classModeRequest = /\b(?:modo clase|modo de clase|class mode|lesson mode)\b/.test(normalized);
  const asksCurrent = /\b(mi|mis|actual|activa|hoy|guardada|posicion|posicionada|donde|voy|quede|quedamos|continue|continua|continuar|continuemos|sigamos|seguir|empecemos|empezar|arranquemos|arrancar|abre|abrir|start|continue|resume|open|today|current|saved)\b/.test(normalized);
  const shortClassRequest = /^(dame|dar|quiero|quisiera|vamos|abre|abrir|empecemos|empezar|arranquemos|continua|continuar|continuemos|sigamos|start|open|continue|resume)\s+(la\s+)?(clase|class|lesson)\b/.test(normalized);
  const resumeCurrentRequest = /\b(continua|continuar|continuemos|sigamos|seguir|retoma|retomar|resume|continue)\b.*\b(donde|voy|quede|quedamos|actual|hoy|current|saved)\b/.test(normalized);

  return classModeRequest || (hasClassWord && asksCurrent) || shortClassRequest || resumeCurrentRequest;
}

export function isGiveClassQuestion(message: string) {
  const normalized = normalizeCoachMessage(message);
  const reviewRequest = /\b(repaso|repasar|review)\b/.test(normalized);
  if (reviewRequest) return false;

  const explicitCoordinates = hasExplicitClassCoordinates(message);
  const conciseCoordinateRequest = explicitCoordinates && normalized.split(" ").length <= 10;
  const actionRequest = explicitCoordinates && /\b(dame|dar|ensename|continua|continuar|empezar|empecemos|ahora|cambia|cambiemos|posiciona|posicionar|ubica|ubicar|actualiza|actualizar|fija|fijar|coloca|colocar|abre|abrir|vamos|quiero|quisiera|sigamos|pasemos|switch|move|start|continue|teach|give|open|set|update)\b/.test(normalized);

  return conciseCoordinateRequest || actionRequest || isActiveClassRequest(message) || [
    "dame la clase",
    "dame clase",
    "dar la clase",
    "ensename la clase",
    "continua la clase",
    "continuar la clase",
    "empecemos clase",
    "empezar clase",
    "empezar la clase",
    "empecemos la clase",
    "give me class",
    "teach me class",
    "start class",
    "continue class",
  ].some((phrase) => normalized.includes(phrase));
}
