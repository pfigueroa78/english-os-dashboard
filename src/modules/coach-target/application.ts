import {
  mergeClassTargetWithPayload,
  resolveClassTargetFromMessage,
  type CoachClassTarget,
} from "./resolve";

export type ResolveCoachClassTargetResult =
  | {
      kind: "resolved";
      target: CoachClassTarget & {
        unit: number;
        localClass: number;
        globalClass: number;
        displayClass: number;
      };
      activeClassContent: unknown;
    }
  | {
      kind: "needs_clarification";
      target: CoachClassTarget;
      activeClassContent: unknown;
      savedUnitLabel: string;
      reply: string;
    };

export async function resolveCoachClassTarget(params: {
  message: string;
  currentUnit: string;
  context: unknown;
  readCurrentClassContent: () => Promise<unknown>;
}): Promise<ResolveCoachClassTargetResult> {
  let target = resolveClassTargetFromMessage(params.message, params.currentUnit, params.context);
  let activeClassContent: unknown = null;

  if (target.needsCurrentClassLookup) {
    try {
      activeClassContent = await params.readCurrentClassContent();
      target = mergeClassTargetWithPayload(target, activeClassContent);
    } catch {
      activeClassContent = null;
    }
  }

  if (!target.unit || !target.localClass) {
    const savedUnitLabel = target.unit ? `Unit ${target.unit}` : "tu unidad actual";
    return {
      kind: "needs_clarification",
      target,
      activeClassContent,
      savedUnitLabel,
      reply: [
        `Encontre ${savedUnitLabel}, pero no tengo un numero de clase activo confiable.`,
        "",
        "Para no inventar **Class 1** ni mezclar una leccion guardada con otra clase, dime exactamente cual quieres abrir.",
        "",
        "Puedes escribir, por ejemplo: **Dame la clase 2 de la unidad 4**.",
      ].join("\n"),
    };
  }

  const unit = target.unit;
  const localClass = target.localClass;
  const globalClass = target.globalClass || (unit - 1) * 7 + localClass;
  const displayClass = target.explicitClassRequest ? localClass : globalClass || localClass;
  return {
    kind: "resolved",
    target: {
      ...target,
      unit,
      localClass,
      globalClass,
      displayClass,
      needsCurrentClassLookup: false,
    },
    activeClassContent,
  };
}
