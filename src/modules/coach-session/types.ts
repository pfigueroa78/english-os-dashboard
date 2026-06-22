export type CoachSessionMode = "current" | "class" | "review" | "guide" | "conversation" | "fallback";

export type CoachSessionSource = "english_os" | "request" | "api" | "fallback" | "contract_probe";

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

export type CoachSessionTransitionEvent =
  | {
      type: "CONTEXT_LOADED";
      savedUnit?: string | number | null;
      savedLesson?: string | null;
      activeUnit?: string | number | null;
      activeClassNumber?: string | number | null;
      lessonTitle?: string | null;
    }
  | {
      type: "USER_REQUESTED_CURRENT_CLASS";
      savedUnit?: string | number | null;
      savedLesson?: string | null;
      activeUnit?: string | number | null;
      activeClassNumber?: string | number | null;
      lessonTitle?: string | null;
    }
  | {
      type: "USER_REQUESTED_CLASS";
      unit?: string | number | null;
      classNumber?: string | number | null;
      lessonTitle?: string | null;
      savedUnit?: string | number | null;
      savedLesson?: string | null;
    }
  | {
      type: "USER_REQUESTED_REVIEW" | "USER_REQUESTED_GUIDE";
      unit?: string | number | null;
      savedUnit?: string | number | null;
      savedLesson?: string | null;
      lessonTitle?: string | null;
    }
  | {
      type: "API_RETURNED_SESSION";
      session: CoachSessionState | CoachSessionInput;
    }
  | {
      type: "USER_SELECTED_UNIT";
      unit: string | number | null;
      savedUnit?: string | number | null;
      savedLesson?: string | null;
    }
  | {
      type: "CONTEXT_FAILED";
      savedUnit?: string | number | null;
      savedLesson?: string | null;
      reason?: string;
    }
  | {
      type: "CONVERSATION_CONTINUED";
      savedUnit?: string | number | null;
      savedLesson?: string | null;
      activeUnit?: string | number | null;
    };

export type CoachSessionTelemetryEvent =
  | {
      type: "session_transition_applied";
      reason: string;
      from: CoachSessionState | null;
      to: CoachSessionState;
    }
  | {
      type: "session_mismatch_detected";
      reason: string;
      details: Record<string, string | number | null>;
    }
  | {
      type: "resources_unit_resolved";
      unit: string | null;
      policy: string;
    };
