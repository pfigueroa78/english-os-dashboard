import type { CoachLearningPulsePanelModel } from "@/modules/coach-session/viewModels";

type CoachLearningPulsePanelProps = {
  model: CoachLearningPulsePanelModel;
};

export function CoachLearningPulsePanel({ model }: CoachLearningPulsePanelProps) {
  return (
    <section className="coach-panel coach-learning-pulse min-w-0 max-w-full overflow-hidden rounded-xl border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Tu avance</p>
      <div className="coach-learning-pulse-grid mt-2">
        <div className="coach-learning-pulse-metric">
          <span>Nivel</span>
          <strong>{model.level}</strong>
        </div>
        <div className="coach-learning-pulse-metric">
          <span>Evidencia</span>
          <strong>{model.evidenceLabel}</strong>
        </div>
      </div>
      <p className="mt-2 text-xs opacity-75">Prácticas recientes: {model.practiceCount}</p>
      <p className="mt-1 text-xs opacity-75">Foco: {model.focus}</p>
      <p className="mt-1 text-xs opacity-75">Siguiente: {model.nextStep}</p>
    </section>
  );
}
