import { createCoachSessionContract } from "./contract";
import { transitionCoachSession } from "./stateMachine";
import type { CoachSessionInput, CoachSessionState } from "./types";

export type CoachSessionStudyMode = "current" | "class" | "review" | "guide";

export type SavedPositionReader = (data: any) => {
  unit: string;
  lesson: string;
  classNumber?: number | null;
};

export function coachModeFromStudyMode(mode: CoachSessionStudyMode): CoachSessionState["mode"] {
  if (mode === "review" || mode === "guide" || mode === "class") return mode;
  return "current";
}

export function createInitialCoachSession(input: {
  e2eDemo: boolean;
  demoUnit: string;
  demoLesson: string;
}) {
  return createCoachSessionContract({
    mode: "current",
    savedUnit: input.e2eDemo ? input.demoUnit : null,
    savedLesson: input.e2eDemo ? input.demoLesson : null,
    activeUnit: input.e2eDemo ? input.demoUnit : null,
    lessonTitle: input.e2eDemo ? input.demoLesson : null,
    resourcesUnit: input.e2eDemo ? input.demoUnit : null,
    source: input.e2eDemo ? "fallback" : "english_os",
  });
}

export function resolveCoachUiSession(input: {
  studyMode: CoachSessionStudyMode;
  currentUnit: string;
  currentLesson: string;
  studyUnit: string;
  studyClassNumber: number | null;
  coachSession: CoachSessionState;
}) {
  return createCoachSessionContract({
    mode: coachModeFromStudyMode(input.studyMode),
    savedUnit: input.currentUnit || input.coachSession.savedUnit,
    savedLesson: input.currentLesson || input.coachSession.savedLesson,
    activeUnit: input.coachSession.activeUnit || input.studyUnit || input.currentUnit,
    activeClassNumber: input.studyClassNumber || input.coachSession.activeClassNumber,
    lessonTitle: input.coachSession.lessonTitle || input.currentLesson,
    resourcesUnit: input.coachSession.resourcesUnit || input.coachSession.activeUnit || input.studyUnit || input.currentUnit,
    source: input.coachSession.source,
  });
}

export function createContextLoadedSession(input: {
  data: any;
  getSavedPosition: SavedPositionReader;
}) {
  const { unit, lesson, classNumber } = input.getSavedPosition(input.data);
  const session = transitionCoachSession({
    current: null,
    event: {
      type: "CONTEXT_LOADED",
      savedUnit: unit || null,
      savedLesson: lesson || null,
      activeUnit: unit || null,
      activeClassNumber: classNumber || null,
      lessonTitle: lesson || null,
    },
  }).state;

  return {
    session,
    unit: session.activeUnit || "",
    lesson: session.lessonTitle || "",
    classNumber: session.activeClassNumber,
    studyMode: session.mode === "class" ? "class" as const : "current" as const,
  };
}

export function createSelectedUnitSession(input: {
  current: CoachSessionState;
  unit: string;
  savedUnit: string;
  savedLesson: string;
}) {
  return transitionCoachSession({
    current: input.current,
    event: {
      type: "USER_SELECTED_UNIT",
      unit: input.unit,
      savedUnit: input.savedUnit,
      savedLesson: input.savedLesson,
    },
  }).state;
}

export function createSavedPositionSession(input: {
  current: CoachSessionState;
  savedUnit: string;
  savedLesson: string;
}) {
  return createCoachSessionContract({
    mode: "current",
    savedUnit: input.savedUnit,
    savedLesson: input.savedLesson,
    activeUnit: input.savedUnit,
    lessonTitle: input.savedLesson,
    resourcesUnit: input.savedUnit,
    source: "english_os",
  });
}

export function createRequestSession(input: CoachSessionInput) {
  return createCoachSessionContract(input);
}
