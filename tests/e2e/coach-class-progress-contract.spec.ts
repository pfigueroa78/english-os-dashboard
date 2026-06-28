import { test, expect } from "@playwright/test";
import {
  advanceClassProgressFromReply,
  buildClassProgressInstruction,
  classProgressKey,
  classRoadmapFromSections,
  createClassProgress,
  loadStoredClassProgress,
  resolveClassProgressTurn,
  saveStoredClassProgress,
} from "../../src/modules/coach-class-progress/application";

const identity = {
  lessonTitle: "Video Class",
  bookPages: "",
  pdfPages: "",
  sections: "Video Class + Before watching + While watching + After watching + Speaking",
  skillFocus: "video discussion",
};

test("class progress builds the finite learner roadmap without wrapper sections", () => {
  expect(classRoadmapFromSections(identity.sections)).toEqual([
    "Before watching",
    "While watching",
    "After watching",
    "Speaking",
    "Evaluation gate",
  ]);

  const progress = createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity });
  expect(progress).toMatchObject({
    unit: 4,
    localClass: 7,
    displayClass: 28,
    currentStepIndex: 0,
    completedStepIndexes: [],
    status: "awaiting_answer",
  });
});

test("class progress instruction makes application state authoritative", () => {
  const progress = createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity });
  const instruction = buildClassProgressInstruction({
    ...progress,
    currentStepIndex: 1,
    completedStepIndexes: [0],
  });

  expect(instruction).toContain("CLASS PROGRESS STATE");
  expect(instruction).toContain("Current step: Paso 2 de 5 - While watching");
  expect(instruction).toContain("advance to Paso 3 - After watching");
  expect(instruction).toContain("do not create a teacher listening simulation by default");
  expect(instruction).toContain("Never open the same numbered step again after approving it");
});

test("approved answers advance exactly one visible step and prevent same-step loops", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(
    progress,
    "This micro-step is approved.\n\nNext micro-step: Paso 3 de 5 - After watching.\n\nAnswer this reflection.",
  );

  expect(next.currentStepIndex).toBe(2);
  expect(next.completedStepIndexes).toEqual([0, 1]);
  expect(next.lastApprovedStepIndex).toBe(1);
  expect(next.status).toBe("awaiting_answer");
});

test("approved answers advance even when the model repeats the same step announcement", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(
    progress,
    "This micro-step is approved.\n\nNext micro-step: Paso 2 de 5 - While watching.\n\nTeacher listening input:",
  );

  expect(next.currentStepIndex).toBe(2);
  expect(next.completedStepIndexes).toEqual([0, 1]);
  expect(next.lastApprovedStepIndex).toBe(1);
});

test("class progress resolver repairs real loop: learner answer is not sent back to the same video simulation", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "The main idea is that different people have different energy patterns and routines. The woman is a morning person, and she plans her day as soon as she arrives at work.",
    reply: "We’re at Paso 2 de 5 - While watching.\nSince the real video isn’t being quoted here, I’ll use a short teacher-created listening simulation.\n\nTeacher listening input:",
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.currentStepIndex).toBe(2);
  expect(resolved.reply).toContain("Paso 3 de 5 - After watching");
  expect(resolved.reply).not.toContain("Teacher listening input");
});

test("video while-watching step asks for the real resource before using a fallback simulation", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "continuemos",
    reply: "We’re at Paso 2 de 5 - While watching.\nTeacher listening input:\nA: Early birds work best in the morning.",
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.currentStepIndex).toBe(1);
  expect(resolved.reply).toContain("Open the video or class resource");
  expect(resolved.reply).toContain("If you cannot open the video");
  expect(resolved.reply).not.toContain("Teacher listening input");
});

test("focused retry keeps the learner on the same visible step", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(progress, "Almost there - one focused retry. Focused retry: Paso 2 de 5 - While watching.");

  expect(next.currentStepIndex).toBe(1);
  expect(next.completedStepIndexes).toEqual([0]);
  expect(next.status).toBe("needs_retry");
});

test("class progress persists and resumes after interruption", () => {
  const storage = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const key = classProgressKey("learner@example.com");
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };

  saveStoredClassProgress(adapter, key, progress);
  const restored = loadStoredClassProgress(adapter, key);

  expect(restored).toMatchObject({
    unit: 4,
    localClass: 7,
    displayClass: 28,
    currentStepIndex: 1,
    completedStepIndexes: [0],
  });
});
