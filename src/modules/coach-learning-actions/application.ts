import { extractUnitNumber, unitLabel } from "@/modules/coach-context/coachContext";
import { renderClientPrompt } from "@/modules/coach-prompts/clientPromptRegistry";

export async function buildStartTodayClassMessage(unit: string, lesson: string) {
  const unitNumber = extractUnitNumber(unit);
  return renderClientPrompt("coach.startCurrentClass", {
    startRequest: unitNumber
      ? `Empecemos la clase actual de la unidad ${unitNumber}. Usa el contrato real de English OS; si no hay numero de clase activo confiable, no inventes Class 1 y pide confirmacion breve.`
      : "Empecemos mi clase actual. Usa el contrato real de English OS; si no hay numero de clase activo confiable, no inventes Class 1 y pide confirmacion breve.",
    lessonContext: lesson ? `Contexto guardado de leccion o foco: ${lesson}` : "",
  });
}

export async function buildHintMessage(unit: string, lesson: string) {
  return renderClientPrompt("coach.hint", {
    unit: unitLabel(unit),
    lessonContext: lesson ? `Clase: ${lesson}` : "",
  });
}

export async function buildUnitGrammarGuideMessage(unit: string) {
  const number = extractUnitNumber(unit);
  return renderClientPrompt("coach.unitGrammarGuide", {
    requestLine: number ? `Dame una guia de gramatica de la unidad ${number}.` : "Dame una guia de gramatica de mi unidad actual.",
  });
}

export async function buildUnitVocabularyGuideMessage(unit: string) {
  const number = extractUnitNumber(unit);
  return renderClientPrompt("coach.unitVocabularyGuide", {
    requestLine: number ? `Dame una guia de vocabulario de la unidad ${number}.` : "Dame una guia de vocabulario de mi unidad actual.",
  });
}
