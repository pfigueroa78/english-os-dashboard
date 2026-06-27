import { expect, test } from "@playwright/test";
import {
  createCoachErrorMessage,
  prepareCoachMessageTurn,
  resolveCoachResponseState,
  stripEphemeralImages,
} from "../../src/modules/coach-message/application";
import { createClassProgress } from "../../src/modules/coach-class-progress/application";

const videoIdentity = {
  lessonTitle: "Video Class",
  bookPages: "",
  pdfPages: "",
  sections: "Video Class + Before watching + While watching + After watching + Speaking",
  skillFocus: "video discussion",
};

const classSession = {
  mode: "class" as const,
  savedUnit: "Unit 4",
  savedLesson: "Video Class",
  activeUnit: "Unit 4",
  activeClassNumber: 28,
  lessonTitle: "Video Class",
  resourcesUnit: "Unit 4",
  source: "english_os" as const,
};

test("coach message application prepares image turns without persisting ephemeral image bytes", async () => {
  const prepared = prepareCoachMessageTurn({
    customMessage: undefined,
    input: "",
    selectedImage: { dataUrl: "data:image/png;base64,new-photo", name: "office.png", mimeType: "image/png" },
    messages: [
      { role: "coach", content: "Send a photo." },
      { role: "user", content: "Previous image", image: { dataUrl: "data:image/png;base64,old-photo", name: "old.png" } },
    ],
    loading: false,
  });

  expect(prepared?.message).toContain("Analiza esta foto");
  expect(prepared?.userMessage.image?.name).toBe("office.png");
  expect(prepared?.requestBody.image).toMatchObject({ name: "office.png", mimeType: "image/png" });
  expect(JSON.stringify(prepared?.requestBody.conversationHistory)).not.toContain("data:image");
  expect(stripEphemeralImages([{ role: "user", content: "x", image: { dataUrl: "data:image/png;base64,x" } }])[0].image).toBeUndefined();
});

test("coach message application sends class progress so answers stay on the class route", async () => {
  const classProgress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity: videoIdentity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const prepared = prepareCoachMessageTurn({
    input: "The main idea is that people have different energy patterns.",
    selectedImage: null,
    messages: [{ role: "coach", content: "Next micro-step: Paso 2 de 5 — While watching." }],
    loading: false,
    currentSession: classSession,
    classProgress,
  });

  expect(prepared?.requestBody.session).toEqual(classSession);
  expect(prepared?.requestBody.classProgress).toMatchObject({
    unit: 4,
    localClass: 7,
    displayClass: 28,
    currentStepIndex: 1,
    completedStepIndexes: [0],
  });
});

test("coach message application trusts the API session over stale client state", async () => {
  const resolved = resolveCoachResponseState({
    requestMessage: "Dame la clase",
    data: {
      ok: true,
      reply: "Pedro Figueroa, vamos con Unit 4, Class 28.",
      session: {
        mode: "class",
        savedUnit: "Unit 4",
        activeUnit: "Unit 4",
        activeClassNumber: 28,
        resourcesUnit: "Unit 4",
        lessonTitle: "Business advice speaking practice: expanding advice with contrast",
        source: "english_os",
      },
    },
    currentUnit: "Unit 1",
    currentLesson: "Stale lesson",
    getSavedPosition: () => ({ unit: "Unit 1", lesson: "Stale lesson", classNumber: null }),
  });

  expect(resolved.studyMode).toBe("class");
  expect(resolved.session.activeUnit).toBe("Unit 4");
  expect(resolved.session.activeClassNumber).toBe(28);
  expect(resolved.session.resourcesUnit).toBe("Unit 4");
  expect(resolved.studyUnit).toBe("Unit 4");
  expect(resolved.studyClassNumber).toBe(28);
});

test("coach message application infers class coordinates only as a fallback when no session is returned", async () => {
  const resolved = resolveCoachResponseState({
    requestMessage: "Empieza clase",
    data: {
      ok: true,
      reply: "Unit 5 — Communication.\nClass: 2.",
    },
    currentUnit: "Unit 1",
    currentLesson: "Old lesson",
    getSavedPosition: () => ({ unit: "Unit 1", lesson: "Old lesson", classNumber: null }),
  });

  expect(resolved.studyMode).toBe("class");
  expect(resolved.session.activeUnit).toBe("Unit 5");
  expect(resolved.studyClassNumber).toBe(2);
  expect(resolved.coachMessage.content).toContain("Unit 5");
});

test("coach message application preserves active class and class progress across correction replies", async () => {
  const classProgress = createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity: videoIdentity });
  const resolved = resolveCoachResponseState({
    requestMessage: "I am more of a morning person because I feel focused.",
    data: {
      ok: true,
      reply: "👍\n\nOriginal sentence\nI am more of a morning person because I feel focused.\n\nCorrected sentence\nI’m more of a morning person because I feel focused.",
      classProgress: { ...classProgress, currentStepIndex: 2, completedStepIndexes: [0, 1] },
    },
    currentUnit: "Unit 4",
    currentLesson: "Video Class",
    currentSession: classSession,
    currentClassProgress: classProgress,
    getSavedPosition: () => ({ unit: "Unit 4", lesson: "Video Class", classNumber: null }),
  });

  expect(resolved.studyMode).toBe("class");
  expect(resolved.session.activeUnit).toBe("Unit 4");
  expect(resolved.session.activeClassNumber).toBe(28);
  expect(resolved.studyClassNumber).toBe(28);
  expect(resolved.classProgress).toMatchObject({
    unit: 4,
    localClass: 7,
    displayClass: 28,
    currentStepIndex: 2,
    completedStepIndexes: [0, 1],
  });
});

test("coach message application returns a learner-safe recoverable error message", async () => {
  const error = createCoachErrorMessage("timeout");

  expect(error.role).toBe("coach");
  expect(error.content).toContain("No pude completar la respuesta esta vez");
  expect(error.content).toContain("Detalle: timeout");
});
