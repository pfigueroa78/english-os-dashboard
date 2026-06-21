"use client";

import type { CoachSessionState } from "@/modules/coach-session/types";
import { sessionLocationLabel, sessionModeLabel, sessionResourcesLabel } from "@/modules/coach-session/selectors";

type CoachStudyPanelProps = {
  session: CoachSessionState;
  contextLoading: boolean;
  studyUnit: string;
  currentUnit: string;
  loading: boolean;
  onStudyUnitChange: (unit: string) => void;
  onStudyUnitBlur: (unit: string) => void;
  onUseSavedPosition: () => void;
  onStartClass: () => void;
};

export function CoachStudyPanel({
  session,
  contextLoading,
  studyUnit,
  currentUnit,
  loading,
  onStudyUnitChange,
  onStudyUnitBlur,
  onUseSavedPosition,
  onStartClass,
}: CoachStudyPanelProps) {
  return (
    <section className="coach-panel min-w-0 max-w-full overflow-hidden rounded-xl border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Objetivo activo</p>
      <h2 className="mt-1 text-lg font-bold">{sessionLocationLabel(session)}</h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-60">Modo: {sessionModeLabel(session.mode)}</p>
      <p className="mt-1 text-xs opacity-70">Posición guardada: {contextLoading ? "Cargando…" : currentUnit}</p>
      <p className="mt-1 text-sm opacity-75">Recursos: {sessionResourcesLabel(session)}.</p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unidad de estudio</label>
      <input
        value={studyUnit}
        onChange={(event) => onStudyUnitChange(event.target.value)}
        onBlur={(event) => onStudyUnitBlur(event.target.value)}
        placeholder={currentUnit}
        className="coach-input mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onUseSavedPosition} disabled={!currentUnit} className="coach-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">
          Usar posición
        </button>
        <button type="button" onClick={onStartClass} disabled={loading || !studyUnit} className="coach-action-primary rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50">
          Clase
        </button>
      </div>
    </section>
  );
}
