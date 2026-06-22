import { createCoachSessionContract, normalizeSessionUnit } from "./contract";
import {
  defaultCoachSessionStateMachineConfig,
  type CoachSessionStateMachineConfig,
} from "./config";
import type {
  CoachSessionInput,
  CoachSessionState,
  CoachSessionTelemetryEvent,
  CoachSessionTransitionEvent,
} from "./types";

export type CoachSessionTransitionResult = {
  state: CoachSessionState;
  events: CoachSessionTelemetryEvent[];
};

type TransitionParams = {
  current: CoachSessionState | null;
  event: CoachSessionTransitionEvent;
  config?: Partial<CoachSessionStateMachineConfig>;
};

export function transitionCoachSession({
  current,
  event,
  config: configOverrides = {},
}: TransitionParams): CoachSessionTransitionResult {
  const config = { ...defaultCoachSessionStateMachineConfig, ...configOverrides };
  const candidate = createCandidateSession(current, event, config);
  const state = enforceInvariants(candidate, current, event, config);
  const events = buildTelemetryEvents(current, state, event, config);
  return { state, events };
}

function createCandidateSession(
  current: CoachSessionState | null,
  event: CoachSessionTransitionEvent,
  config: CoachSessionStateMachineConfig,
): CoachSessionState {
  if (event.type === "API_RETURNED_SESSION") {
    return createCoachSessionContract({
      ...event.session,
      source: event.session.source || "api",
    });
  }

  if (event.type === "CONTEXT_LOADED") {
    const activeUnit = event.activeUnit || event.savedUnit || current?.activeUnit || current?.savedUnit;
    return createCoachSessionContract({
      mode: event.activeClassNumber ? "class" : config.defaultMode,
      savedUnit: event.savedUnit,
      savedLesson: event.savedLesson,
      activeUnit,
      activeClassNumber: event.activeClassNumber,
      lessonTitle: event.lessonTitle || event.savedLesson || current?.lessonTitle,
      resourcesUnit: activeUnit,
      source: "english_os",
    });
  }

  if (event.type === "USER_REQUESTED_CURRENT_CLASS") {
    const activeUnit = event.activeUnit || current?.activeUnit || event.savedUnit || current?.savedUnit;
    const activeClassNumber = event.activeClassNumber || current?.activeClassNumber;
    return createCoachSessionContract({
      mode: "class",
      savedUnit: event.savedUnit || current?.savedUnit,
      savedLesson: event.savedLesson || current?.savedLesson,
      activeUnit,
      activeClassNumber,
      lessonTitle: event.lessonTitle || event.savedLesson || current?.lessonTitle || current?.savedLesson,
      resourcesUnit: activeUnit,
      source: "english_os",
    });
  }

  if (event.type === "USER_REQUESTED_CLASS") {
    const activeUnit = event.unit || event.savedUnit || current?.activeUnit || current?.savedUnit;
    return createCoachSessionContract({
      mode: "class",
      savedUnit: event.savedUnit || current?.savedUnit,
      savedLesson: event.savedLesson || current?.savedLesson,
      activeUnit,
      activeClassNumber: event.classNumber,
      lessonTitle: event.lessonTitle || current?.lessonTitle,
      resourcesUnit: activeUnit,
      source: "request",
    });
  }

  if (event.type === "USER_REQUESTED_REVIEW" || event.type === "USER_REQUESTED_GUIDE") {
    const activeUnit = event.unit || event.savedUnit || current?.activeUnit || current?.savedUnit;
    return createCoachSessionContract({
      mode: event.type === "USER_REQUESTED_REVIEW" ? "review" : "guide",
      savedUnit: event.savedUnit || current?.savedUnit,
      savedLesson: event.savedLesson || current?.savedLesson,
      activeUnit,
      lessonTitle: event.lessonTitle || current?.lessonTitle,
      resourcesUnit: activeUnit,
      source: "request",
    });
  }

  if (event.type === "USER_SELECTED_UNIT") {
    const activeUnit = event.unit || current?.activeUnit || current?.savedUnit;
    return createCoachSessionContract({
      mode: "class",
      savedUnit: event.savedUnit || current?.savedUnit,
      savedLesson: event.savedLesson || current?.savedLesson,
      activeUnit,
      lessonTitle: current?.lessonTitle || event.savedLesson || current?.savedLesson,
      resourcesUnit: activeUnit,
      source: "request",
    });
  }

  if (event.type === "CONTEXT_FAILED") {
    return createCoachSessionContract({
      mode: config.fallbackMode,
      savedUnit: event.savedUnit || current?.savedUnit,
      savedLesson: event.savedLesson || current?.savedLesson,
      activeUnit: current?.activeUnit || event.savedUnit || current?.savedUnit,
      lessonTitle: current?.lessonTitle || event.savedLesson || current?.savedLesson,
      resourcesUnit: current?.resourcesUnit || current?.activeUnit || event.savedUnit || current?.savedUnit,
      source: "fallback",
    });
  }

  const conversationEvent = event.type === "CONVERSATION_CONTINUED" ? event : null;
  return createCoachSessionContract({
    mode: "conversation",
    savedUnit: conversationEvent?.savedUnit || current?.savedUnit,
    savedLesson: conversationEvent?.savedLesson || current?.savedLesson,
    activeUnit: conversationEvent?.activeUnit || current?.activeUnit || current?.savedUnit,
    lessonTitle: current?.lessonTitle || conversationEvent?.savedLesson || current?.savedLesson,
    resourcesUnit: conversationEvent?.activeUnit || current?.resourcesUnit || current?.activeUnit || current?.savedUnit,
    source: config.defaultSource,
  });
}

function enforceInvariants(
  state: CoachSessionState,
  current: CoachSessionState | null,
  event: CoachSessionTransitionEvent,
  config: CoachSessionStateMachineConfig,
) {
  const nextInput: CoachSessionInput = { ...state };

  if (state.mode === "class" && config.classModeRequiresUnit && !state.activeUnit) {
    nextInput.mode = "fallback";
    nextInput.source = "fallback";
    nextInput.activeUnit = current?.activeUnit || current?.savedUnit || null;
    nextInput.resourcesUnit = current?.resourcesUnit || current?.activeUnit || current?.savedUnit || null;
  }

  if (state.mode === "class" && config.classModeRequiresClassNumber && !state.activeClassNumber) {
    nextInput.mode = "fallback";
    nextInput.source = "fallback";
  }

  if (config.resourcePolicy === "follow-active-unit") {
    nextInput.resourcesUnit = state.activeUnit || state.resourcesUnit || current?.resourcesUnit || null;
  }

  if (event.type === "API_RETURNED_SESSION" && state.activeUnit && state.resourcesUnit && state.activeUnit !== state.resourcesUnit) {
    nextInput.resourcesUnit = state.activeUnit;
  }

  return createCoachSessionContract(nextInput);
}

function buildTelemetryEvents(
  from: CoachSessionState | null,
  to: CoachSessionState,
  event: CoachSessionTransitionEvent,
  config: CoachSessionStateMachineConfig,
): CoachSessionTelemetryEvent[] {
  const events: CoachSessionTelemetryEvent[] = [
    {
      type: "session_transition_applied",
      reason: event.type,
      from,
      to,
    },
    {
      type: "resources_unit_resolved",
      unit: to.resourcesUnit,
      policy: config.resourcePolicy,
    },
  ];

  const requestedUnit = requestedUnitFromEvent(event);
  if (requestedUnit && to.activeUnit && requestedUnit !== to.activeUnit) {
    events.push({
      type: "session_mismatch_detected",
      reason: "requested_unit_differs_from_resolved_active_unit",
      details: {
        requestedUnit,
        resolvedActiveUnit: to.activeUnit,
      },
    });
  }

  if (to.mode === "class" && to.activeUnit && to.resourcesUnit && to.activeUnit !== to.resourcesUnit) {
    events.push({
      type: "session_mismatch_detected",
      reason: "resources_unit_differs_from_active_unit",
      details: {
        activeUnit: to.activeUnit,
        resourcesUnit: to.resourcesUnit,
      },
    });
  }

  return events;
}

function requestedUnitFromEvent(event: CoachSessionTransitionEvent) {
  if ("unit" in event) return normalizeSessionUnit(event.unit);
  if ("activeUnit" in event) return normalizeSessionUnit(event.activeUnit);
  return null;
}
