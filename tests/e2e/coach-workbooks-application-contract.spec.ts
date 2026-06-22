import { expect, test } from "@playwright/test";
import { createCoachWorkbook } from "../../src/modules/coach-workbooks/application";

test("coach workbooks application creates render-ready workbook results", async () => {
  const calls: any[] = [];
  const result = await createCoachWorkbook({
    api: {
      createWorkbook: async (params) => {
        calls.push(params);
        return {
          ok: true,
          workbook: {
            title: "English OS Grammar Workbook",
            fileId: "abc",
            fileUrl: "https://sheets.example/workbook",
            exportUrl: "https://download.example/workbook.xlsx",
            unit: params.unit,
            lesson: params.lesson,
            generatedAt: "2026-06-22",
          },
        };
      },
    },
    kind: "grammar",
    unit: "Unit 4",
    studyMode: "current",
    currentLesson: "Time clauses",
  });

  expect(calls).toEqual([{ kind: "grammar", unit: "Unit 4", lesson: "Time clauses" }]);
  expect(result?.openUrl).toBe("https://download.example/workbook.xlsx");
  expect(result?.workbook).toMatchObject({ kind: "grammar", unit: "Unit 4", lesson: "Time clauses" });
  expect(result?.coachMessage.content).toContain("Generé la guía de gramática para Unit 4");
  expect(result?.coachMessage.content).toContain("Descargar XLSX");
  expect(result?.coachMessage.content).toContain("Abrir en Sheets");
});

test("coach workbooks application omits lesson outside current-position mode", async () => {
  const calls: any[] = [];
  await createCoachWorkbook({
    api: {
      createWorkbook: async (params) => {
        calls.push(params);
        return {
          ok: true,
          workbook: {
            title: "English OS Vocabulary Workbook",
            fileUrl: "https://sheets.example/vocabulary",
            exportUrl: "",
            unit: params.unit,
            lesson: params.lesson,
          },
        };
      },
    },
    kind: "vocabulary",
    unit: "Unit 5",
    studyMode: "class",
    currentLesson: "Making conversation",
  });

  expect(calls).toEqual([{ kind: "vocabulary", unit: "Unit 5", lesson: "" }]);
});

test("coach workbooks application rejects invalid workbook contracts without opening browser concerns", async () => {
  await expect(
    createCoachWorkbook({
      api: {
        createWorkbook: async () => ({ ok: true, workbook: { title: "Broken" } }),
      },
      kind: "grammar",
      unit: "Unit 4",
      studyMode: "guide",
      currentLesson: "",
    }),
  ).rejects.toThrow("Invalid grammar workbook contract.");
});

test("coach workbooks application does nothing when unit is unavailable", async () => {
  const result = await createCoachWorkbook({
    api: {
      createWorkbook: async () => {
        throw new Error("should not be called");
      },
    },
    kind: "grammar",
    unit: "",
    studyMode: "current",
    currentLesson: "Saved lesson",
  });

  expect(result).toBeNull();
});
