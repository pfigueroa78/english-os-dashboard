import { test, expect } from "@playwright/test";
import {
  advanceClassProgressFromReply,
  buildClassProgressInstruction,
  classProgressKey,
  classRoadmapFromSections,
  createClassProgress,
  loadStoredClassProgress,
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
  expect(instruction).toContain("Current step: Paso 2 de 5 — While watching");
  expect(instruction).toContain("advance to Paso 3 — After watching");
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
    "This micro-step is approved.\n\nNext micro-step: Paso 3 de 5 — After watching.\n\nAnswer this reflection.",
  );

  expect(next.currentStepIndex).toBe(2);
  expect(next.completedStepIndexes).toEqual([0, 1]);
  expect(next.lastApprovedStepIndex).toBe(1);
  expect(next.status).toBe("awaiting_answer");
});

test("focused retry keeps the learner on the same visible step", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(progress, "Almost there — one focused retry. Focused retry: Paso 2 de 5 — While watching.");

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
