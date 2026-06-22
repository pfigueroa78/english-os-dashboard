import { expect, test } from "@playwright/test";
import { runCoachDiagnostics } from "../../src/modules/coach-diagnostics/application";

test("coach diagnostics application maps checks and telemetry without UI rules", async () => {
  const result = await runCoachDiagnostics({
    api: {
      async getDiagnostics() {
        return {
          ok: true,
          checks: [{ name: "Auth", ok: true, detail: "Signed in" }],
          sessionTelemetry: [{
            id: "event-1",
            at: "2026-06-22T00:00:00.000Z",
            requestKind: "class",
            source: "test",
            session: { mode: "class", activeUnit: "Unit 5", activeClassNumber: 2, resourcesUnit: "Unit 5" },
            events: [],
          }],
        };
      },
    },
  });

  expect(result).toEqual({
    checks: [{ name: "Auth", ok: true, detail: "Signed in" }],
    sessionTelemetry: [{
      id: "event-1",
      at: "2026-06-22T00:00:00.000Z",
      requestKind: "class",
      source: "test",
      session: { mode: "class", activeUnit: "Unit 5", activeClassNumber: 2, resourcesUnit: "Unit 5" },
      events: [],
    }],
    error: "",
  });
});

test("coach diagnostics application exposes failed diagnostics as render-ready error", async () => {
  const result = await runCoachDiagnostics({
    api: {
      async getDiagnostics() {
        return { ok: false, checks: [], sessionTelemetry: [] };
      },
    },
  });

  expect(result.checks).toEqual([]);
  expect(result.sessionTelemetry).toEqual([]);
  expect(result.error).toBe("El diagnostico encontro uno o mas puntos para revisar.");
});

test("coach diagnostics application catches adapter failures", async () => {
  const result = await runCoachDiagnostics({
    api: {
      async getDiagnostics() {
        throw new Error("Diagnostics endpoint failed");
      },
    },
  });

  expect(result).toEqual({
    checks: [],
    sessionTelemetry: [],
    error: "Diagnostics endpoint failed",
  });
});
