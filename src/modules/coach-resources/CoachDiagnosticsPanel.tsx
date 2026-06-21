"use client";

type CoachDiagnosticCheckModel = {
  name: string;
  ok: boolean;
  detail: string;
};

export type CoachDiagnosticsPanelModel = {
  visible: boolean;
  loading: boolean;
  error: string;
  checks: CoachDiagnosticCheckModel[];
};

type CoachDiagnosticsPanelProps = {
  model: CoachDiagnosticsPanelModel;
  onRunDiagnostics: () => void;
};

export function CoachDiagnosticsPanel({ model, onRunDiagnostics }: CoachDiagnosticsPanelProps) {
  if (!model.visible) return null;

  return (
    <section className="coach-panel min-w-0 max-w-full overflow-hidden rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Diagnóstico</p>
          <p className="mt-1 text-xs opacity-70">Auth, API y contexto English OS.</p>
        </div>
        <button
          type="button"
          onClick={onRunDiagnostics}
          disabled={model.loading}
          className="coach-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {model.loading ? "Revisando..." : "Revisar"}
        </button>
      </div>

      {model.error && <p className="mt-2 rounded-xl border border-red-300/50 bg-red-50 px-3 py-2 text-xs text-red-800">{model.error}</p>}

      {model.checks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {model.checks.map((check) => (
            <li key={check.name} className="rounded-xl border px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{check.name}</span>
                <span className={check.ok ? "text-emerald-700" : "text-red-700"}>{check.ok ? "OK" : "Revisar"}</span>
              </div>
              <p className="mt-1 opacity-75">{check.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
