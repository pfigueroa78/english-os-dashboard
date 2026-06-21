type CoachLearningPulsePanelProps = {
  level: string;
  evidenceLabel: string;
  practiceCount: number;
  focus: string;
  nextStep: string;
};

export function CoachLearningPulsePanel({
  level,
  evidenceLabel,
  practiceCount,
  focus,
  nextStep,
}: CoachLearningPulsePanelProps) {
  return (
    <section className="coach-panel coach-learning-pulse min-w-0 max-w-full overflow-hidden rounded-xl border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Tu avance</p>
      <div className="coach-learning-pulse-grid mt-2">
        <div className="coach-learning-pulse-metric">
          <span>Nivel</span>
          <strong>{level}</strong>
        </div>
        <div className="coach-learning-pulse-metric">
          <span>Evidencia</span>
          <strong>{evidenceLabel}</strong>
        </div>
      </div>
      <p className="mt-2 text-xs opacity-75">Prácticas recientes: {practiceCount}</p>
      <p className="mt-1 text-xs opacity-75">Foco: {focus}</p>
      <p className="mt-1 text-xs opacity-75">Siguiente: {nextStep}</p>
    </section>
  );
}
