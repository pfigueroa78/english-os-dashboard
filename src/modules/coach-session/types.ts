export type CoachSessionMode = "current" | "class" | "review" | "guide" | "conversation";

export type CoachSessionSource = "english_os" | "request" | "fallback" | "contract_probe";

export type CoachSessionState = {
  mode: CoachSessionMode;
  savedUnit: string | null;
  savedLesson: string | null;
  activeUnit: string | null;
  activeClassNumber: number | null;
  lessonTitle: string | null;
  resourcesUnit: string | null;
  source: CoachSessionSource;
};

export type CoachSessionInput = {
  mode: CoachSessionMode;
  savedUnit?: string | number | null;
  savedLesson?: string | null;
  activeUnit?: string | number | null;
  activeClassNumber?: string | number | null;
  lessonTitle?: string | null;
  resourcesUnit?: string | number | null;
  source?: CoachSessionSource;
};

