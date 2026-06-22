import type { CoachSessionMode, CoachSessionSource } from "./types";

export type CoachSessionResourcePolicy = "follow-active-unit" | "keep-explicit-resources-unit";

export type CoachSessionStateMachineConfig = {
  defaultMode: CoachSessionMode;
  fallbackMode: Extract<CoachSessionMode, "fallback">;
  classModeRequiresUnit: boolean;
  classModeRequiresClassNumber: boolean;
  resourcePolicy: CoachSessionResourcePolicy;
  defaultSource: CoachSessionSource;
};

export const defaultCoachSessionStateMachineConfig: CoachSessionStateMachineConfig = {
  defaultMode: "current",
  fallbackMode: "fallback",
  classModeRequiresUnit: true,
  classModeRequiresClassNumber: false,
  resourcePolicy: "follow-active-unit",
  defaultSource: "english_os",
};
