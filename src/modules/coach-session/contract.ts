import type { CoachSessionInput, CoachSessionState } from "./types";

function unitNumber(value: string | number | null | undefined) {
  const match = String(value ?? "").match(/\d{1,2}/);
  return match ? Number(match[0]) : null;
}

export function normalizeSessionUnit(value: string | number | null | undefined) {
  const number = unitNumber(value);
  return number ? `Unit ${number}` : null;
}

function normalizeClassNumber(value: string | number | null | undefined) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function createCoachSessionContract(input: CoachSessionInput): CoachSessionState {
  const savedUnit = normalizeSessionUnit(input.savedUnit);
  const activeUnit = normalizeSessionUnit(input.activeUnit) || savedUnit;
  const resourcesUnit = normalizeSessionUnit(input.resourcesUnit) || activeUnit;
  const savedLesson = input.savedLesson?.trim() || null;
  const lessonTitle = input.lessonTitle?.trim() || savedLesson;

  return {
    mode: input.mode,
    savedUnit,
    savedLesson,
    activeUnit,
    activeClassNumber: input.mode === "class" ? normalizeClassNumber(input.activeClassNumber) : null,
    lessonTitle,
    resourcesUnit,
    source: input.source || "english_os",
  };
}

export function legacyActiveUnit(session: CoachSessionState) {
  return unitNumber(session.activeUnit);
}

export function legacyActiveClass(session: CoachSessionState) {
  return session.activeClassNumber;
}

