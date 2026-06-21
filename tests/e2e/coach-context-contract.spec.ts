import { expect, test } from "@playwright/test";
import {
  learningPulseDetail,
  toCoachLearnerContextContract,
} from "../../src/modules/coach-integrations/contextContract";

test("learner context contract keeps saved unit and lesson paired from the same source", async () => {
  const contract = toCoachLearnerContextContract({
    learnerId: "learner@example.com",
    context: {
      recommendedCurrentPosition: {
        unit: "Unit 4",
        lesson: "Business advice speaking practice: expanding advice with contrast",
      },
      user: {
        "Current Unit": "Unit 1",
        "Current Lesson": "Older lesson",
      },
    },
  }, "learner@example.com");

  expect(contract.savedPosition).toEqual({
    unit: "Unit 4",
    lesson: "Business advice speaking practice: expanding advice with contrast",
  });
  expect(JSON.stringify(contract)).not.toContain("[object Object]");
});

test("learner context contract renders object-based progress as readable learning pulse", async () => {
  const contract = toCoachLearnerContextContract({
    context: {
      user: { "Current CEFR": "B1+" },
      missionControl: {
        lastEvaluation: { score: "78/100" },
        topMistake: { mistake: "articles before singular nouns" },
        nextAction: { action: "short speaking drill" },
      },
      recentDailyLogs: [
        { nextAction: "practice fluency" },
        { nextAction: "review vocabulary" },
      ],
      recentProgress: [{ cefrEstimate: "B1+" }],
      activeVocabulary: [{ wordChunk: "take a break" }],
    },
  });

  expect(contract.progressSnapshot).toBe("nivel actual B1+ · última evidencia: 78/100 · 2 prácticas recientes");
  expect(contract.learningPulse).toEqual({
    level: "B1+",
    practiceCount: 2,
    evidenceCount: 4,
    evidenceTotal: 4,
    focus: "articles before singular nouns",
    nextStep: "short speaking drill",
  });
  expect(learningPulseDetail(contract.learningPulse)).toBe("4/4");
  expect(JSON.stringify(contract)).not.toContain("[object Object]");
});

test("learner context contract does not invent progress when evidence is missing", async () => {
  const contract = toCoachLearnerContextContract({});

  expect(contract.progressSnapshot).toBe("sin evaluaciones recientes disponibles");
  expect(contract.learningPulse).toEqual({
    level: "Sin nivel confirmado",
    practiceCount: 0,
    evidenceCount: null,
    evidenceTotal: 4,
    focus: "responder con más evidencia",
    nextStep: "producir una respuesta breve y corregible",
  });
  expect(learningPulseDetail(contract.learningPulse)).toBe("sin evidencias");
});
