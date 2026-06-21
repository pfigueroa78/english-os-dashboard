import { expect, test } from "@playwright/test";
import { toCoachDriveResourcesContract } from "../../src/modules/coach-integrations/resourcesContract";
import { toCoachWorkbookContract } from "../../src/modules/coach-integrations/workbookContract";

test("drive resources contract hides raw Drive fields and preserves render/practice data", async () => {
  const resources = toCoachDriveResourcesContract([
    {
      resourceId: "audio-1",
      title: "Listening A",
      description: "Audio resource",
      type: "audio",
      unitNumber: "4",
      unitCode: "U04",
      section: "A",
      page: "30",
      exercise: "5",
      exercisePart: "B",
      url: "https://open",
      embedUrl: "https://embed",
      provider: "drive",
      mimeType: "audio/mpeg",
      order: 2,
    },
  ]);

  expect(resources).toEqual([
    {
      id: "audio-1",
      title: "Listening A",
      description: "Audio resource",
      type: "audio",
      unitNumber: 4,
      unitCode: "U04",
      section: "A",
      page: "30",
      exercise: "5",
      exercisePart: "B",
      url: "https://open",
      embedUrl: "https://embed",
      provider: "drive",
      order: 2,
    },
  ]);
  expect(JSON.stringify(resources)).not.toContain("mimeType");
  expect(JSON.stringify(resources)).not.toContain("resourceId");
});

test("drive resources contract infers media type from mime type when needed", async () => {
  expect(toCoachDriveResourcesContract([
    {
      id: "video-1",
      title: "Video",
      mimeType: "video/mp4",
      url: "https://open-video",
    },
    {
      id: "audio-1",
      title: "Audio",
      mimeType: "audio/mpeg",
      url: "https://open-audio",
    },
  ])).toMatchObject([
    { id: "audio-1", type: "audio" },
    { id: "video-1", type: "video" },
  ]);
});

test("workbook contract exposes stable workbook shape for grammar and vocabulary", async () => {
  expect(toCoachWorkbookContract("grammar", {
    title: "Grammar Guide",
    fileId: "file-1",
    fileUrl: "https://sheet",
    exportUrl: "https://xlsx",
    mimeType: "application/vnd.google-apps.spreadsheet",
    unit: "Unit 4",
    lesson: "Time clauses",
    generatedAt: "2026-06-21T00:00:00Z",
  })).toEqual({
    kind: "grammar",
    title: "Grammar Guide",
    fileId: "file-1",
    fileUrl: "https://sheet",
    exportUrl: "https://xlsx",
    unit: "Unit 4",
    lesson: "Time clauses",
    generatedAt: "2026-06-21T00:00:00Z",
  });
});
