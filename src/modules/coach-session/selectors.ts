import type { CoachSessionState } from "./types";

export function sessionModeLabel(mode: CoachSessionState["mode"]) {
  if (mode === "review") return "Repaso";
  if (mode === "guide") return "Guía";
  if (mode === "class") return "Clase";
  if (mode === "conversation") return "Conversación";
  return "Actual";
}

export function sessionLocationLabel(session: CoachSessionState) {
  return [
    session.activeUnit || session.savedUnit || "Unidad actual",
    session.mode === "class" && session.activeClassNumber ? `Class ${session.activeClassNumber}` : "",
  ].filter(Boolean).join(" · ");
}

export function sessionResourcesLabel(session: CoachSessionState) {
  return session.resourcesUnit || session.activeUnit || session.savedUnit || "la unidad actual";
}

export function sessionHeaderDetail(session: CoachSessionState) {
  return `${sessionModeLabel(session.mode)} · ${sessionLocationLabel(session)}`;
}
