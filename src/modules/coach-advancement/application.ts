import type { CoachClassProgressState } from "@/modules/coach-class-progress/application";
import type { CoachSessionState } from "@/modules/coach-session/types";
import { courseStructureRepository } from "@/modules/coach-config/pedagogyConfig";

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
}): CoachAdvancementDecision {
  const progress = params.classProgress;
  const course = courseStructureRepository();

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
      course.isUnitCheckpoint(progress.localClass)
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
  forceNextUnit?: boolean;
}): CoachAdvancementTarget | null {
  const course = courseStructureRepository();
  const next = params.forceNextUnit
    ? course.nextUnit(params.unit)
    : course.nextClass(params.unit, params.localClass);

  if (!next) return null;

  return {
    unit: next.unit,
    localClass: next.localClass,
    globalClass: next.globalClass,
    displayClass: next.globalClass,
    reason: next.unit > params.unit ? "next_unit" : "next_class",
  };
}
