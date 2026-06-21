export type CoachMessageFeedbackValue = "like" | "dislike";
export type CoachFeedbackState = Record<number, CoachMessageFeedbackValue>;

export type CoachClipboardEnvironment = {
  clipboard?: Pick<Clipboard, "writeText"> | null;
  document?: Pick<Document, "createElement" | "body" | "execCommand"> | null;
};

export type CoachReportParams = {
  content: string;
  index: number;
  activeLocationLabel: string;
  email: string;
  studyModeLabel: string;
  href?: string;
  nowIso: string;
};

export type CoachResourcePracticeInput = {
  activeStudyUnitLabel: string;
  resource: {
    title: string;
    type: string;
    section?: string;
    page?: string;
    exercise?: string;
    exercisePart?: string;
    url: string;
  };
};

export function toggleCoachMessageFeedback(
  current: CoachFeedbackState,
  index: number,
  value: CoachMessageFeedbackValue,
): CoachFeedbackState {
  const next = { ...current };
  if (next[index] === value) delete next[index];
  else next[index] = value;
  return next;
}

export async function copyCoachText(
  content: string,
  environment: CoachClipboardEnvironment,
) {
  const text = String(content || "").trim();
  if (!text) return false;

  try {
    await environment.clipboard?.writeText(text);
    return true;
  } catch {
    return copyCoachTextWithTextarea(text, environment.document);
  }
}

export function buildCoachReportMailto(params: CoachReportParams) {
  const messageText = String(params.content || "").trim();
  const subject = `English OS error report · ${params.activeLocationLabel || "Coach"}`;
  const body = [
    "Hola, quiero reportar un posible error en esta respuesta de English OS.",
    "",
    `Fecha: ${params.nowIso}`,
    `Learner: ${params.email}`,
    `Modo: ${params.studyModeLabel}`,
    `Objetivo activo: ${params.activeLocationLabel || "No definido"}`,
    params.href ? `URL: ${params.href}` : "",
    `Mensaje #: ${params.index + 1}`,
    "",
    "Texto reportado:",
    "----------------",
    messageText,
  ]
    .filter(Boolean)
    .join("\n");

  return `mailto:info@citizen-life.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 6000))}`;
}

export function buildCoachResourcePracticeMessage(params: CoachResourcePracticeInput) {
  const details = [
    `Title: ${params.resource.title}`,
    `Type: ${params.resource.type}`,
    params.resource.section ? `Section: ${params.resource.section}` : "",
    params.resource.page ? `Page: ${params.resource.page}` : "",
    params.resource.exercise ? `Exercise: ${params.resource.exercise}${params.resource.exercisePart || ""}` : "",
    `URL: ${params.resource.url}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `Vamos a trabajar con este recurso de ${params.activeStudyUnitLabel}.\n\n${details}\n\nCrea una actividad completa para estudiar este recurso.`;
}

function copyCoachTextWithTextarea(text: string, documentRef: CoachClipboardEnvironment["document"]) {
  if (!documentRef) return false;
  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  documentRef.body.appendChild(textarea);
  textarea.select();
  documentRef.execCommand("copy");
  documentRef.body.removeChild(textarea);
  return true;
}
