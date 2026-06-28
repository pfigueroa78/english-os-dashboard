import type { CoachClassProgressState } from "@/modules/coach-class-progress/application";
import type { CoachSessionState } from "@/modules/coach-session/types";

export type CoachAdvancementIntent = "next_class" | "next_unit";

export type CoachAdvancementTarget = {
  unit: number;
  localClass: number;
  globalClass: number;
  displayClass: number;
  reason: "next_class" | "next_unit" | "course_complete";
};

export type CoachAdvancementDecision =
  | {
      kind: "advance";
      target: CoachAdvancementTarget;
      replyPrefix: string;
    }
  | {
      kind: "blocked";
      reason: "no_active_class" | "class_not_approved" | "course_complete";
      reply: string;
    };

export function resolveApprovedClassAdvancement(params: {
  intent: CoachAdvancementIntent;
  classProgress: CoachClassProgressState | null;
  session?: CoachSessionState | null;
  maxUnits?: number;
  classesPerUnit?: number;
}): CoachAdvancementDecision {
  const classesPerUnit = params.classesPerUnit || 7;
  const maxUnits = params.maxUnits || 12;
  const progress = params.classProgress;

  if (!progress) {
    return {
      kind: "blocked",
      reason: "no_active_class",
      reply: [
        "No tengo una clase activa aprobada para avanzar.",
        "",
        "Pide primero tu clase actual o indica una clase concreta, por ejemplo: **Dame la clase 1 de la unidad 5**.",
      ].join("\n"),
    };
  }

  if (progress.status !== "approved") {
    return {
      kind: "blocked",
      reason: "class_not_approved",
      reply: [
        `Todavía no puedo avanzar desde Unit ${progress.unit}, Class ${progress.displayClass}.`,
        "",
        "Primero completa y aprueba el evaluation gate/checkpoint de la clase actual. Después sí puedo abrir la siguiente clase.",
      ].join("\n"),
    };
  }

  const next = nextClassTarget({
    unit: progress.unit,
    localClass: progress.localClass,
    classesPerUnit,
    maxUnits,
    forceNextUnit: params.intent === "next_unit",
  });

  if (!next) {
    return {
      kind: "blocked",
      reason: "course_complete",
      reply: [
        "Ya completaste la última clase disponible del curso.",
        "",
        "El siguiente paso recomendado es una evaluación final o un plan de refuerzo personalizado.",
      ].join("\n"),
    };
  }

  return {
    kind: "advance",
    target: next,
    replyPrefix: [
      progress.localClass === classesPerUnit
        ? `✅ Unit ${progress.unit} checkpoint approved. Moving to the next unit.`
        : `✅ Class ${progress.displayClass} approved. Moving to the next class.`,
      "",
      `Now opening Unit ${next.unit}, Class ${next.localClass} · Global Class ${next.globalClass}.`,
    ].join("\n"),
  };
}

export function nextClassTarget(params: {
  unit: number;
  localClass: number;
  classesPerUnit?: number;
  maxUnits?: number;
  forceNextUnit?: boolean;
}): CoachAdvancementTarget | null {
  const classesPerUnit = params.classesPerUnit || 7;
  const maxUnits = params.maxUnits || 12;
  const currentUnit = params.unit;
  const currentLocalClass = params.localClass;
  const forceNextUnit = Boolean(params.forceNextUnit);

  const nextUnit = forceNextUnit || currentLocalClass >= classesPerUnit
    ? currentUnit + 1
    : currentUnit;
  const nextLocalClass = forceNextUnit || currentLocalClass >= classesPerUnit
    ? 1
    : currentLocalClass + 1;

  if (nextUnit > maxUnits) return null;

  const globalClass = (nextUnit - 1) * classesPerUnit + nextLocalClass;
  return {
    unit: nextUnit,
    localClass: nextLocalClass,
    globalClass,
    displayClass: globalClass,
    reason: nextUnit > currentUnit ? "next_unit" : "next_class",
  };
}
