import {
  extractRequestedClassNumber,
  extractRequestedUnitNumber,
  hasExplicitClassCoordinates,
} from "@/lib/coachIntent";

export type CoachClassCoordinates = {
  unit: number | null;
  localClass: number | null;
  globalClass: number | null;
};

export type CoachClassTarget = CoachClassCoordinates & {
  explicitClassRequest: boolean;
  needsCurrentClassLookup: boolean;
};

export function firstNumericValue(...values: unknown[]) {
  for (const value of values) {
    const match = String(value || "").match(/\d{1,2}/);
    if (match?.[0]) return Number(match[0]);
  }
  return null;
}

export function localClassFromAnyClassNumber(value: number | null, unit: number | null) {
  if (!value) return null;
  if (value >= 1 && value <= 7) return value;
  if (unit && value > 7) {
    const local = value - (unit - 1) * 7;
    if (local >= 1 && local <= 7) return local;
  }
  return null;
}

export function resolveCurrentLocalClass(context: any, unit: number | null) {
  const user = context?.user || {};
  const recommended = context?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || {};
  const learningState = context?.learningState || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || {};
  const classIndex = context?.currentClassIndex || context?.classContent?.currentClassIndex || {};
  const rawClass = firstNumericValue(
    user["Current Class"],
    user.CurrentClass,
    user["Class"],
    recommended.currentClass,
    recommended.classNumber,
    recommended.globalClass,
    current.currentClass,
    current.classNumber,
    current.globalClass,
    learningState.currentClass,
    learningState.classNumber,
    learningState.globalClass,
    missionControl.currentClass,
    missionControl.classNumber,
    missionControl.globalClass,
    classIndex.classNumber,
    classIndex.localClass,
    classIndex.globalClass,
    user["Current Position"],
    context?.currentLesson,
    missionControl.currentLesson,
  );
  return localClassFromAnyClassNumber(rawClass, unit);
}

function firstNumberByKey(value: unknown, keyPattern: RegExp): number | null {
  const seen = new Set<unknown>();
  const visit = (node: unknown): number | null => {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (keyPattern.test(key)) {
        const found = firstNumericValue(child);
        if (found) return found;
      }
      const nested = visit(child);
      if (nested) return nested;
    }
    return null;
  };
  return visit(value);
}

function collectStrings(value: unknown, limit = 80) {
  const strings: string[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown) => {
    if (strings.length >= limit || node == null) return;
    if (typeof node === "string") {
      const text = node.trim();
      if (text) strings.push(text);
      return;
    }
    if (typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    for (const child of Object.values(node as Record<string, unknown>)) visit(child);
  };
  visit(value);
  return strings;
}

export function resolveClassCoordinatesFromPayload(value: unknown, fallbackUnit: number | null = null): CoachClassCoordinates {
  const unit =
    firstNumberByKey(value, /^(currentUnit|unit|unitNumber|activeUnit)$/i) ||
    fallbackUnit ||
    null;
  const localByKey = firstNumberByKey(value, /^(localClass|currentLocalClass|activeLocalClass)$/i);
  const globalByKey = firstNumberByKey(value, /^(globalClass|currentGlobalClass|activeGlobalClass|classNumber)$/i);
  const strings = collectStrings(value);
  const textUnit = unit || firstNumericValue(strings.find((text) => /\bunit\s+\d{1,2}\b/i.test(text)));
  const classText = strings.find((text) => /\bclass\s+\d{1,2}\b/i.test(text));
  const classFromText = classText?.match(/\bclass\s+(\d{1,2})\b/i)?.[1] ? Number(classText.match(/\bclass\s+(\d{1,2})\b/i)?.[1]) : null;
  const resolvedUnit = textUnit || null;
  const localClass =
    localClassFromAnyClassNumber(localByKey, resolvedUnit) ||
    localClassFromAnyClassNumber(globalByKey, resolvedUnit) ||
    localClassFromAnyClassNumber(classFromText, resolvedUnit);
  const globalClass = resolvedUnit && localClass ? (resolvedUnit - 1) * 7 + localClass : null;
  return { unit: resolvedUnit, localClass, globalClass };
}

export function resolveClassTargetFromMessage(message: string, fallbackUnit?: string, context?: any): CoachClassTarget {
  const user = context?.user || {};
  const recommended = context?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || {};
  const learningState = context?.learningState || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || {};
  const classIndex = context?.currentClassIndex || context?.classContent?.currentClassIndex || {};
  const activeUnit = firstNumericValue(
    learningState.currentUnit,
    classIndex.unit,
    recommended.currentUnit,
    recommended.unit,
    current.currentUnit,
    current.unit,
    missionControl.currentUnit,
    missionControl.unit,
    user["Current Unit"],
    user.CurrentUnit,
  );
  const unit = extractRequestedUnitNumber(message) || activeUnit || Number(String(fallbackUnit || "").match(/\d{1,2}/)?.[0] || 0) || null;
  const explicitClass = extractRequestedClassNumber(message);
  const localClass = explicitClass || resolveCurrentLocalClass(context, unit);
  const globalClass = unit && localClass ? (unit - 1) * 7 + localClass : null;
  return {
    unit,
    localClass,
    globalClass,
    explicitClassRequest: hasExplicitClassCoordinates(message),
    needsCurrentClassLookup: !unit || !localClass,
  };
}

export function mergeClassTargetWithPayload(target: CoachClassTarget, payload: unknown): CoachClassTarget {
  const activeCoordinates = resolveClassCoordinatesFromPayload(payload, target.unit);
  const unit = activeCoordinates.unit || target.unit;
  const localClass = activeCoordinates.localClass || target.localClass;
  const globalClass = activeCoordinates.globalClass || (unit && localClass ? (unit - 1) * 7 + localClass : null);
  return {
    ...target,
    unit,
    localClass,
    globalClass,
    needsCurrentClassLookup: !unit || !localClass,
  };
}

export function resolveUnitTarget(message: string, fallbackUnit?: string) {
  return extractRequestedUnitNumber(message) || Number(String(fallbackUnit || "").match(/\d{1,2}/)?.[0] || 0) || null;
}
