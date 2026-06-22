import type { CoachApiClient } from "@/modules/coach-api/coachApiClient";

export type CoachDiagnosticCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type CoachDiagnosticTelemetry = {
  id: string;
  at: string;
  requestKind: string;
  source: string;
  session: {
    mode: string;
    activeUnit: string | null;
    activeClassNumber: number | null;
    resourcesUnit: string | null;
  };
  events: Array<{ type: string; reason?: string; unit?: string | null; policy?: string }>;
};

export type RunCoachDiagnosticsResult = {
  checks: CoachDiagnosticCheck[];
  sessionTelemetry: CoachDiagnosticTelemetry[];
  error: string;
};

export async function runCoachDiagnostics(params: {
  api: Pick<CoachApiClient, "getDiagnostics">;
}): Promise<RunCoachDiagnosticsResult> {
  try {
    const data = await params.api.getDiagnostics();
    return {
      checks: Array.isArray(data?.checks) ? data.checks : [],
      sessionTelemetry: Array.isArray(data?.sessionTelemetry) ? data.sessionTelemetry : [],
      error: data?.ok === false ? "El diagnostico encontro uno o mas puntos para revisar." : "",
    };
  } catch (err) {
    return {
      checks: [],
      sessionTelemetry: [],
      error: err instanceof Error ? err.message : "No pude ejecutar el diagnostico.",
    };
  }
}
