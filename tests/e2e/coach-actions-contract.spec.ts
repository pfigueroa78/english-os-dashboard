import { test, expect } from "@playwright/test";
import {
  buildCoachReportMailto,
  buildCoachResourcePracticeMessage,
  copyCoachText,
  toggleCoachMessageFeedback,
} from "../../src/modules/coach-actions/coachActions";

test("coach actions toggle feedback without mutating current state", () => {
  const current = { 2: "like" as const };
  expect(toggleCoachMessageFeedback(current, 2, "like")).toEqual({});
  expect(current).toEqual({ 2: "like" });
  expect(toggleCoachMessageFeedback(current, 2, "dislike")).toEqual({ 2: "dislike" });
});

test("coach actions build report mailto with bounded encoded content", () => {
  const mailto = buildCoachReportMailto({
    content: "Teacher answer",
    index: 3,
    activeLocationLabel: "Unit 4 · Class 2",
    email: "learner@example.com",
    recipientEmail: "support-address",
    studyModeLabel: "Clase",
    href: "https://example.com/coach",
    nowIso: "2026-06-21T10:00:00.000Z",
  });

  expect(mailto).toContain("mailto:support-address");
  expect(decodeURIComponent(mailto)).toContain("English OS error report · Unit 4 · Class 2");
  expect(decodeURIComponent(mailto)).toContain("Mensaje #: 4");
  expect(decodeURIComponent(mailto)).toContain("Teacher answer");
});

test("coach actions build resource practice messages from the render contract", () => {
  expect(
    buildCoachResourcePracticeMessage({
      activeStudyUnitLabel: "Unit 4",
      resource: {
        title: "Audio 5B",
        type: "audio",
        section: "A",
        page: "30",
        exercise: "5",
        exercisePart: "B",
        url: "https://example.com/audio",
      },
    }),
  ).toContain("Vamos a trabajar con este recurso de Unit 4.\n\nTitle: Audio 5B\nType: audio\nSection: A\nPage: 30\nExercise: 5B\nURL: https://example.com/audio");
});

test("coach actions copy text through clipboard when available", async () => {
  const copied: string[] = [];
  await expect(
    copyCoachText(" hello ", {
      clipboard: {
        writeText: async (value) => {
          copied.push(value);
        },
      },
    }),
  ).resolves.toBe(true);

  expect(copied).toEqual(["hello"]);
  await expect(copyCoachText("   ", {})).resolves.toBe(false);
});
