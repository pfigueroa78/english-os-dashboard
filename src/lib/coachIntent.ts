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

export function isGiveClassQuestion(message: string) {
  const normalized = normalizeCoachMessage(message);
  const reviewRequest = /\b(repaso|repasar|review)\b/.test(normalized);
  if (reviewRequest) return false;

  const explicitCoordinates = Boolean(
    extractRequestedUnitNumber(message) && extractRequestedClassNumber(message),
  );
  const conciseCoordinateRequest = explicitCoordinates && normalized.split(" ").length <= 10;
  const actionRequest = explicitCoordinates && /\b(dame|dar|ensename|continua|continuar|empezar|empecemos|ahora|cambia|cambiemos|vamos|quiero|quisiera|sigamos|pasemos|switch|move|start|continue|teach|give)\b/.test(normalized);

  return conciseCoordinateRequest || actionRequest || [
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
