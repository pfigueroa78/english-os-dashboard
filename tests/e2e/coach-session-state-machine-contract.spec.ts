import { expect, test } from "@playwright/test";
import { createCoachSessionContract } from "../../src/modules/coach-session/contract";
import { transitionCoachSession } from "../../src/modules/coach-session/stateMachine";

test("session machine loads English OS current class as the active source of truth", () => {
  const result = transitionCoachSession({
    current: null,
    event: {
      type: "CONTEXT_LOADED",
      savedUnit: "Unit 4",
      savedLesson: "Business advice speaking practice: expanding advice with contrast",
      activeClassNumber: 28,
      lessonTitle: "Business advice speaking practice: expanding advice with contrast",
    },
  });

  expect(result.state).toMatchObject({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 4",
    activeClassNumber: 28,
    resourcesUnit: "Unit 4",
    source: "english_os",
  });
  expect(result.events.map((event) => event.type)).toContain("session_transition_applied");
  expect(result.events).toContainEqual({
    type: "resources_unit_resolved",
    unit: "Unit 4",
    policy: "follow-active-unit",
  });
});

test("session machine treats an implicit class request as the saved active class", () => {
  const current = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 4",
    activeClassNumber: 28,
    lessonTitle: "Business advice speaking practice: expanding advice with contrast",
    resourcesUnit: "Unit 4",
  });

  const result = transitionCoachSession({
    current,
    event: {
      type: "USER_REQUESTED_CURRENT_CLASS",
      savedUnit: "Unit 4",
      savedLesson: "Business advice speaking practice: expanding advice with contrast",
    },
  });

  expect(result.state).toMatchObject({
    mode: "class",
    activeUnit: "Unit 4",
    activeClassNumber: 28,
    resourcesUnit: "Unit 4",
  });
});

test("session machine honors explicit unit and class requests over the saved position", () => {
  const current = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 4",
    activeClassNumber: 28,
    resourcesUnit: "Unit 4",
  });

  const result = transitionCoachSession({
    current,
    event: {
      type: "USER_REQUESTED_CLASS",
      unit: 5,
      classNumber: 1,
      lessonTitle: "Making conversation",
      savedUnit: "Unit 4",
    },
  });

  expect(result.state).toMatchObject({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 5",
    activeClassNumber: 1,
    lessonTitle: "Making conversation",
    resourcesUnit: "Unit 5",
    source: "request",
  });
});

test("session machine normalizes API sessions and prevents resource drift", () => {
  const current = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 1",
    activeUnit: "Unit 1",
    activeClassNumber: 1,
    resourcesUnit: "Unit 1",
  });

  const result = transitionCoachSession({
    current,
    event: {
      type: "API_RETURNED_SESSION",
      session: {
        mode: "class",
        savedUnit: "Unit 1",
        activeUnit: "Unit 4",
        activeClassNumber: 28,
        resourcesUnit: "Unit 1",
        lessonTitle: "Business advice speaking practice: expanding advice with contrast",
        source: "api",
      },
    },
  });

  expect(result.state).toMatchObject({
    mode: "class",
    activeUnit: "Unit 4",
    activeClassNumber: 28,
    resourcesUnit: "Unit 4",
  });
  expect(result.events).toContainEqual({
    type: "resources_unit_resolved",
    unit: "Unit 4",
    policy: "follow-active-unit",
  });
});

test("session machine falls back without inventing a class when context fails", () => {
  const result = transitionCoachSession({
    current: null,
    event: {
      type: "CONTEXT_FAILED",
      reason: "English OS unavailable",
    },
  });

  expect(result.state).toMatchObject({
    mode: "fallback",
    activeUnit: null,
    activeClassNumber: null,
    resourcesUnit: null,
    source: "fallback",
  });
});
