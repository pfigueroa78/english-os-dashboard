import { expect, test } from "@playwright/test";
import { loadCoachResources } from "../../src/modules/coach-resources/application";

test("coach resources application returns resources, notice, and no component-side rules", async () => {
  const result = await loadCoachResources({
    unit: "Unit 5",
    api: {
      async getDriveUnitResources() {
        return {
          ok: true,
          resources: [{ id: "r1", title: "Audio", description: "Practice", type: "audio" }],
          notice: "No encontre materiales conectados para Unit 5.",
        };
      },
    },
  });

  expect(result).toEqual({
    resources: [{ id: "r1", title: "Audio", description: "Practice", type: "audio" }],
    notice: "No encontre materiales conectados para Unit 5.",
    error: "",
  });
});

test("coach resources application converts missing environment errors into a non-blocking notice", async () => {
  const result = await loadCoachResources({
    unit: "Unit 4",
    api: {
      async getDriveUnitResources() {
        throw new Error("Missing English OS environment variables.");
      },
    },
  });

  expect(result.resources).toEqual([]);
  expect(result.error).toBe("");
  expect(result.notice).toContain("ENGLISH_OS_BASE_URL");
});

test("coach resources application preserves unexpected errors as render-ready error state", async () => {
  const result = await loadCoachResources({
    unit: "Unit 4",
    api: {
      async getDriveUnitResources() {
        throw new Error("Drive timeout");
      },
    },
  });

  expect(result).toEqual({
    resources: [],
    notice: "",
    error: "Drive timeout",
  });
});
