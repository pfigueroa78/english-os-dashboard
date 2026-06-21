import { test, expect } from "@playwright/test";
import {
  buildInitialCoachMessage,
  buildInitialCoachMessages,
  buildLearningPulse,
  buildProgressSnapshot,
  getLearnerDisplayName,
  getSavedPosition,
  learningPulseDetail,
  normalizeUnitValue,
} from "../../src/modules/coach-context/coachContext";

test("coach context resolves saved unit and lesson from the same source", () => {
  const data = {
    context: {
      recommendedCurrentPosition: { unit: "Unit 4", lesson: "Advice with contrast" },
      currentPosition: { unit: "Unit 2", lesson: "Older lesson" },
      user: { "Current Unit": "Unit 1", "Current Lesson": "User lesson" },
    },
  };

  expect(getSavedPosition(data)).toEqual({ unit: "Unit 4", lesson: "Advice with contrast" });
  expect(normalizeUnitValue("4")).toBe("Unit 4");
});

test("coach context builds progress without inventing evidence", () => {
  const context = {
    context: {
      user: { "Current CEFR": "B1+" },
      recentDailyLogs: [{ nextAction: "practice contrast" }, { nextAction: "review" }],
      recentMistakes: [{ mistake: "articles" }],
    },
  };

  expect(buildProgressSnapshot(context)).toBe("nivel actual B1+ · 2 prácticas recientes · foco: articles");
  const pulse = buildLearningPulse(context);
  expect(pulse).toMatchObject({
    level: "B1+",
    practiceCount: 2,
    evidenceCount: 2,
    evidenceTotal: 4,
    focus: "articles",
    nextStep: "practice contrast",
  });
  expect(learningPulseDetail(pulse)).toBe("2/4");
  expect(learningPulseDetail(buildLearningPulse({}))).toBe("sin evidencias");
});

test("coach context creates learner-safe initial messages without hardcoded Pedro", () => {
  expect(getLearnerDisplayName({ firstName: "María Isabel", fullName: "Pedro" })).toBe("María Isabel");
  expect(buildInitialCoachMessage("Unit 2", "Life lessons", "", "María Isabel")).toContain("Hola, María Isabel.");
  expect(
    buildInitialCoachMessages({
      e2eDemo: false,
      demoUnit: "Unit 1",
      demoLesson: "Demo lesson",
      demoLearnerName: "Pedro",
    }),
  ).toEqual([{ role: "coach", content: "Loading your English OS class plan..." }]);
});
