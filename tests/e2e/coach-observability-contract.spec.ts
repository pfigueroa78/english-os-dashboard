import { expect, test } from "@playwright/test";
import {
  clearCoachSessionTelemetry,
  readCoachSessionTelemetry,
  recordCoachSessionTelemetry,
} from "../../src/modules/coach-observability/sessionTelemetry";
import { createCoachSessionContract } from "../../src/modules/coach-session/contract";
import { toCoachDiagnosticsPanelModel } from "../../src/modules/coach-session/viewModels";

test("coach session telemetry stores sanitized transition evidence", () => {
  clearCoachSessionTelemetry();
  const session = createCoachSessionContract({
    mode: "class",
    savedUnit: "Unit 4",
    activeUnit: "Unit 5",
    activeClassNumber: 2,
    resourcesUnit: "Unit 5",
    source: "request",
  });

  const record = recordCoachSessionTelemetry({
    learnerEmail: "pedro@example.com",
    requestKind: "class",
    source: "Local Class Pack + Pedagogy Prompt",
    session,
    events: [
      { type: "session_transition_applied", reason: "API_RETURNED_SESSION", from: null, to: session },
      { type: "resources_unit_resolved", unit: "Unit 5", policy: "follow-active-unit" },
    ],
    now: new Date("2026-06-21T20:00:00.000Z"),
  });

  expect(record.learnerKey).toMatch(/^learner-/);
  expect(JSON.stringify(record)).not.toContain("pedro@example.com");
  expect(record.session).toEqual({
    mode: "class",
    activeUnit: "Unit 5",
    activeClassNumber: 2,
    resourcesUnit: "Unit 5",
    source: "request",
  });
  expect(readCoachSessionTelemetry(1)).toEqual([record]);
});

test("coach diagnostics view model exposes render-ready session signals", () => {
  expect(toCoachDiagnosticsPanelModel({
    e2eDemo: false,
    contextError: "",
    diagnosticsError: "",
    diagnosticsLoading: false,
    diagnosticChecks: [],
    sessionTelemetry: [],
  }).visible).toBe(true);

  const model = toCoachDiagnosticsPanelModel({
    e2eDemo: false,
    contextError: "",
    diagnosticsError: "",
    diagnosticsLoading: false,
    diagnosticChecks: [],
    sessionTelemetry: [
      {
        id: "event-1",
        at: "2026-06-21T20:00:00.000Z",
        requestKind: "class",
        source: "Local Class Pack + Pedagogy Prompt",
        session: {
          mode: "class",
          activeUnit: "Unit 5",
          activeClassNumber: 2,
          resourcesUnit: "Unit 5",
        },
        events: [{ type: "resources_unit_resolved", unit: "Unit 5", policy: "follow-active-unit" }],
      },
    ],
  });

  expect(model.visible).toBe(true);
  expect(model.sessionTelemetry).toEqual([
    {
      id: "event-1",
      label: "class · Unit 5 · Class 2",
      detail: "class · recursos Unit 5",
      ok: true,
    },
  ]);
});
