import { createCoachSessionContract } from "@/modules/coach-session/contract";
import { coachModeFromStudyMode, type CoachSessionStudyMode } from "@/modules/coach-session/application";
import { transitionCoachSession } from "@/modules/coach-session/stateMachine";
import type { CoachSessionState } from "@/modules/coach-session/types";

export type CoachControllerMessage = {
  role: "user" | "coach";
  content: string;
  image?: {
    dataUrl: string;
    name?: string;
  };
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: number;
  };
};

export type CoachImagePayload = {
  dataUrl: string;
  name?: string;
  mimeType?: string;
};

export type CoachStudyMode = CoachSessionStudyMode;

export function isReviewRequest(value: string) {
  return /\b(repas(?:o|ar|emos)|review|reinforcement|checkpoint)\b/i.test(value);
}

export function isGuideRequest(value: string) {
  return /\b(gu[ií]a|guide)\b/i.test(value) && /\b(gram[aá]tica|grammar|vocabulario|vocabulary)\b/i.test(value);
}

export { coachModeFromStudyMode };

export function inferCoordinatesFromReply(reply: string) {
  const text = String(reply || "");
  const unit = Number(text.match(/\bUnit\s+(\d{1,2})\b/i)?.[1] || 0) || null;
  const classNumber = Number(
    text.match(/\bClass\s*(?::|#|-|\s)\s*(\d{1,2})\b/i)?.[1] || 0,
  ) || null;
  return { unit, classNumber };
}

export function stripEphemeralImages(messages: CoachControllerMessage[]) {
  return messages.map((message) => (message.image ? { ...message, image: undefined } : message));
}

export function prepareCoachMessageTurn(params: {
  customMessage?: string;
  input: string;
  selectedImage: CoachImagePayload | null;
  messages: CoachControllerMessage[];
  loading: boolean;
}) {
  const imageToAnalyze = params.customMessage ? null : params.selectedImage;
  const message = (params.customMessage || params.input || (imageToAnalyze ? "Analiza esta foto y ayúdame a aprender vocabulario en inglés." : "")).trim();
  if ((!message && !imageToAnalyze) || params.loading) return null;

  return {
    message,
    imageToAnalyze,
    userMessage: {
      role: "user" as const,
      content: message,
      image: imageToAnalyze ? { dataUrl: imageToAnalyze.dataUrl, name: imageToAnalyze.name } : undefined,
    },
    requestBody: {
      message,
      conversationHistory: stripEphemeralImages(params.messages.slice(-12)),
      image: imageToAnalyze ? { dataUrl: imageToAnalyze.dataUrl, mimeType: imageToAnalyze.mimeType, name: imageToAnalyze.name } : undefined,
    },
  };
}

export function createDemoCoachTurn(prepared: NonNullable<ReturnType<typeof prepareCoachMessageTurn>>) {
  return [
    prepared.userMessage,
    { role: "coach" as const, content: "Modo demo: el profesor respondería aquí usando el contexto real de la clase." },
  ];
}

export function resolveCoachResponseState(params: {
  requestMessage: string;
  data: any;
  currentUnit: string;
  currentLesson: string;
  currentSession?: CoachSessionState | null;
  getSavedPosition: (data: any) => { unit: string; lesson: string; classNumber?: number | null };
}) {
  const savedPosition = params.getSavedPosition(params.data);
  const reply = params.data.reply || "No response returned.";
  const inferredCoordinates = inferCoordinatesFromReply(reply);
  const activeUnit = params.data.activeUnit || inferredCoordinates.unit;
  const activeClass = params.data.activeClass || inferredCoordinates.classNumber;
  const unit = activeUnit ? `Unit ${activeUnit}` : "";
  const lesson = savedPosition.lesson;
  const studyMode: CoachStudyMode = isReviewRequest(params.requestMessage) ? "review" : isGuideRequest(params.requestMessage) ? "guide" : "class";
  const currentSession = params.currentSession || createCoachSessionContract({
    mode: savedPosition.classNumber ? "class" : "current",
    savedUnit: savedPosition.unit || params.currentUnit,
    savedLesson: lesson || params.currentLesson,
    activeUnit: savedPosition.unit || params.currentUnit,
    activeClassNumber: savedPosition.classNumber,
    lessonTitle: lesson || params.currentLesson,
    resourcesUnit: savedPosition.unit || params.currentUnit,
    source: "english_os",
  });
  const transition = transitionCoachSession({
    current: currentSession,
    event: params.data.session
      ? { type: "API_RETURNED_SESSION", session: params.data.session as CoachSessionState }
      : studyMode === "review"
        ? {
          type: "USER_REQUESTED_REVIEW",
          unit: unit || savedPosition.unit || params.currentUnit,
          savedUnit: savedPosition.unit || params.currentUnit,
          savedLesson: lesson || params.currentLesson,
          lessonTitle: lesson || params.currentLesson,
        }
        : studyMode === "guide"
          ? {
            type: "USER_REQUESTED_GUIDE",
            unit: unit || savedPosition.unit || params.currentUnit,
            savedUnit: savedPosition.unit || params.currentUnit,
            savedLesson: lesson || params.currentLesson,
            lessonTitle: lesson || params.currentLesson,
          }
          : {
            type: "USER_REQUESTED_CLASS",
            unit: unit || savedPosition.unit || currentSession.activeUnit || params.currentUnit,
            classNumber: activeClass || savedPosition.classNumber || currentSession.activeClassNumber,
            savedUnit: savedPosition.unit || params.currentUnit,
            savedLesson: lesson || params.currentLesson,
            lessonTitle: lesson || params.currentLesson,
          },
  });
  const session = transition.state;

  return {
    reply,
    studyMode,
    session,
    sessionEvents: transition.events,
    studyUnit: session.activeUnit || unit,
    studyClassNumber: session.activeClassNumber && studyMode === "class" ? Number(session.activeClassNumber) : null,
    currentLesson: session.lessonTitle || lesson,
    coachMessage: {
      role: "coach" as const,
      content: reply,
      usage: params.data.usage,
    },
  };
}

export function createCoachErrorMessage(errorMessage: string) {
  return {
    role: "coach" as const,
    content: `No pude completar la respuesta esta vez. Puedes volver a enviarla.\n\nDetalle: ${errorMessage}`,
  };
}
