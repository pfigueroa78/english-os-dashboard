"use client";

import type { CoachStudyPanelModel } from "@/modules/coach-session/viewModels";

type CoachStudyPanelProps = {
  model: CoachStudyPanelModel;
  onStudyUnitChange: (unit: string) => void;
  onStudyUnitBlur: (unit: string) => void;
  onUseSavedPosition: () => void;
  onStartClass: () => void;
};

export function CoachStudyPanel({
  model,
  onStudyUnitChange,
  onStudyUnitBlur,
  onUseSavedPosition,
  onStartClass,
}: CoachStudyPanelProps) {
  return (
    <section className="coach-panel min-w-0 max-w-full overflow-hidden rounded-xl border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Objetivo activo</p>
      <h2 className="mt-1 text-lg font-bold">{model.title}</h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-60">Modo: {model.modeLabel}</p>
      <p className="mt-1 text-xs opacity-70">Posición guardada: {model.savedPositionLabel}</p>
      <p className="mt-1 text-sm opacity-75">Recursos: {model.resourcesLabel}.</p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unidad de estudio</label>
      <input
        value={model.studyUnitValue}
        onChange={(event) => onStudyUnitChange(event.target.value)}
        onBlur={(event) => onStudyUnitBlur(event.target.value)}
        placeholder={model.studyUnitPlaceholder}
        className="coach-input mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onUseSavedPosition} disabled={!model.canUseSavedPosition} className="coach-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">
          Usar posición
        </button>
        <button type="button" onClick={onStartClass} disabled={!model.canStartClass} className="coach-action-primary rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50">
          Clase
        </button>
      </div>
    </section>
  );
}
