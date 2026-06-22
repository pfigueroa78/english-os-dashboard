export type CoachTheme = "slate" | "paper" | "sage" | "sand" | "blue";
export type CoachTextSize = "compact" | "normal" | "large";

export const COACH_TEXT_SIZE_ORDER: CoachTextSize[] = ["compact", "normal", "large"];
export const DEFAULT_SIDEBAR_WIDTH = 340;
export const MIN_SIDEBAR_WIDTH = 260;
export const MAX_SIDEBAR_WIDTH = 560;

export function nextCoachTextSize(current: CoachTextSize, direction: -1 | 1): CoachTextSize {
  const currentIndex = COACH_TEXT_SIZE_ORDER.indexOf(current);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), COACH_TEXT_SIZE_ORDER.length - 1);
  return COACH_TEXT_SIZE_ORDER[nextIndex] || "normal";
}

export function resolveCoachSidebarWidthFromClientX(params: {
  clientX: number;
  viewportWidth: number;
}) {
  const viewportWidth = params.viewportWidth || 1280;
  const responsiveMax = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - 560));
  return Math.min(Math.max(Math.round(params.clientX), MIN_SIDEBAR_WIDTH), responsiveMax);
}

export function isCoachTextSize(value: unknown): value is CoachTextSize {
  return typeof value === "string" && COACH_TEXT_SIZE_ORDER.includes(value as CoachTextSize);
}
