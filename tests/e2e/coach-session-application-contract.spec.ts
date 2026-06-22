import { expect, test } from "@playwright/test";
import {
  createContextLoadedSession,
  createInitialCoachSession,
  createSavedPositionSession,
  createSelectedUnitSession,
  resolveCoachUiSession,
} from "../../src/modules/coach-session/application";
import { createCoachSessionContract } from "../../src/modules/coach-session/contract";

test("coach session application creates initial and context-loaded states", () => {
  expect(createInitialCoachSession({
    e2eDemo: true,
    demoUnit: "Unit 1",
    demoLesson: "Business advice speaking practice",
  })).toMatchObject({
    mode: "current",
    activeUnit: "Unit 1",
    resourcesUnit: "Unit 1",
    lessonTitle: "Business advice speaking practice",
  });

  const contextSession = createContextLoadedSession({
    data: {
      context: {
        recommendedCurrentPosition: {
          unit: "Unit 4",
          lesson: "Business advice speaking practice",
          classNumber: 28,
        },
      },
    },
    getSavedPosition: () => ({
      unit: "Unit 4",
      lesson: "Business advice speaking practice",
      classNumber: 28,
    }),
  });

  expect(contextSession).toMatchObject({
    unit: "Unit 4",
    lesson: "Business advice speaking practice",
    classNumber: 28,
    studyMode: "class",
    session: {
      mode: "class",
      activeUnit: "Unit 4",
      activeClassNumber: 28,
      resourcesUnit: "Unit 4",
    },
  });
});

test("coach session application resolves UI session without leaking component rules", () => {
  const session = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 4",
    savedLesson: "Current lesson",
    activeUnit: "Unit 5",
    activeClassNumber: 2,
    lessonTitle: "Making conversation",
    resourcesUnit: "Unit 5",
    source: "request",
  });

  expect(resolveCoachUiSession({
    studyMode: "class",
    currentUnit: "Unit 4",
    currentLesson: "Current lesson",
    studyUnit: "Unit 5",
    studyClassNumber: 2,
    coachSession: session,
  })).toMatchObject({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 5",
    activeClassNumber: 2,
    lessonTitle: "Making conversation",
    resourcesUnit: "Unit 5",
  });
});

test("coach session application handles selected units and saved position commands", () => {
  const current = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 4",
    savedLesson: "Saved lesson",
    activeUnit: "Unit 4",
    activeClassNumber: 28,
    resourcesUnit: "Unit 4",
    source: "english_os",
  });

  expect(createSelectedUnitSession({
    current,
    unit: "5",
    savedUnit: "Unit 4",
    savedLesson: "Saved lesson",
  })).toMatchObject({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 5",
    activeClassNumber: null,
    resourcesUnit: "Unit 5",
    source: "request",
  });

  expect(createSavedPositionSession({
    current,
    savedUnit: "Unit 4",
    savedLesson: "Saved lesson",
  })).toMatchObject({
    mode: "current",
    savedUnit: "Unit 4",
    activeUnit: "Unit 4",
    activeClassNumber: null,
    resourcesUnit: "Unit 4",
    source: "english_os",
  });
});

test("coach page controller delegates session rules to the application layer", async () => {
  const fs = await import("node:fs/promises");
  const pageController = await fs.readFile("src/modules/coach-page/useCoachPageController.ts", "utf8");

  expect(pageController).toContain("createContextLoadedSession");
  expect(pageController).toContain("resolveCoachUiSession");
  expect(pageController).toContain("createSelectedUnitSession");
  expect(pageController).toContain("createSavedPositionSession");
  expect(pageController).not.toContain('from "@/modules/coach-session/contract"');
  expect(pageController).not.toContain("createCoachSessionContract({");
});
