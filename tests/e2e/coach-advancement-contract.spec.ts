import { expect, test } from "@playwright/test";
import { classifyCoachIntent } from "../../src/lib/coachIntent";
import {
  nextClassTarget,
  resolveApprovedClassAdvancement,
} from "../../src/modules/coach-advancement/application";
import type { CoachClassProgressState } from "../../src/modules/coach-class-progress/application";

function approvedProgress(overrides: Partial<CoachClassProgressState> = {}): CoachClassProgressState {
  return {
    unit: 4,
    localClass: 7,
    displayClass: 28,
    lessonTitle: "Video Class",
    steps: ["Before watching", "While watching", "After watching", "Speaking", "Evaluation gate"],
    currentStepIndex: 4,
    completedStepIndexes: [0, 1, 2, 3, 4],
    status: "approved",
    lastApprovedStepIndex: 4,
    updatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

test("coach intent separates next-class and next-unit requests from active class requests", () => {
  expect(classifyCoachIntent("dame la clase siguiente")).toMatchObject({ kind: "next_class" });
  expect(classifyCoachIntent("move to the next unit")).toMatchObject({ kind: "next_unit" });
  expect(classifyCoachIntent("pasemos a la siguiente")).toMatchObject({ kind: "next_class" });
  expect(classifyCoachIntent("dame la clase")).toMatchObject({ kind: "active_class" });
});

test("advancement opens Unit 5 Class 1 / Global Class 29 after Unit 4 Class 28 checkpoint approval", () => {
  const decision = resolveApprovedClassAdvancement({
    intent: "next_unit",
    classProgress: approvedProgress(),
  });

  expect(decision.kind).toBe("advance");
  if (decision.kind === "advance") {
    expect(decision.target).toEqual({
      unit: 5,
      localClass: 1,
      globalClass: 29,
      displayClass: 29,
      reason: "next_unit",
    });
    expect(decision.replyPrefix).toContain("Unit 4 checkpoint approved");
    expect(decision.replyPrefix).toContain("Unit 5, Class 1");
  }
});

test("advancement opens the next class inside the same unit when the approved class is not a unit checkpoint", () => {
  expect(nextClassTarget({ unit: 4, localClass: 6 })).toEqual({
    unit: 4,
    localClass: 7,
    globalClass: 28,
    displayClass: 28,
    reason: "next_class",
  });
});

test("advancement is blocked when the active class is not approved", () => {
  const decision = resolveApprovedClassAdvancement({
    intent: "next_class",
    classProgress: approvedProgress({ status: "awaiting_answer", completedStepIndexes: [0, 1] }),
  });

  expect(decision).toMatchObject({
    kind: "blocked",
    reason: "class_not_approved",
  });
  if (decision.kind === "blocked") {
    expect(decision.reply).toContain("completa y aprueba");
  }
});

test("advancement stops cleanly after the last course class", () => {
  const decision = resolveApprovedClassAdvancement({
    intent: "next_class",
    classProgress: approvedProgress({ unit: 12, localClass: 7, displayClass: 84 }),
  });

  expect(decision).toMatchObject({
    kind: "blocked",
    reason: "course_complete",
  });
});
