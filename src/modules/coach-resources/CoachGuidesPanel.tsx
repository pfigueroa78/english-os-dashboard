export type CoachWorkbook = {
  title: string;
  fileUrl: string;
  exportUrl: string;
  generatedAt?: string;
};

type CoachGuidesPanelProps = {
  unitLabel: string;
  canUseWorkbookActions: boolean;
  chatActionsDisabled: boolean;
  grammarWorkbookLoading: boolean;
  vocabularyWorkbookLoading: boolean;
  grammarWorkbookError: string;
  vocabularyWorkbookError: string;
  grammarWorkbook: CoachWorkbook | null;
  vocabularyWorkbook: CoachWorkbook | null;
  onCreateGrammarWorkbook: () => void;
  onCreateVocabularyWorkbook: () => void;
  onRequestGrammarGuide: () => void;
  onRequestVocabularyGuide: () => void;
};

function WorkbookCard({ kind, workbook }: { kind: "grammar" | "vocabulary"; workbook: CoachWorkbook | null }) {
  if (!workbook) return null;
  const label = kind === "grammar" ? "gramática" : "vocabulario";
  return (
    <div className="coach-workbook-card rounded-2xl border p-3 text-sm">
      <p className="font-semibold">Guía de {label} generada</p>
      <p className="mt-1 break-words text-xs">{workbook.title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={workbook.exportUrl} target="_blank" rel="noreferrer" className="coach-workbook-link rounded-xl px-3 py-2 text-center text-xs font-semibold">
          XLSX
        </a>
        <a href={workbook.fileUrl} target="_blank" rel="noreferrer" className="coach-workbook-link rounded-xl px-3 py-2 text-center text-xs font-semibold">
          Sheets
        </a>
      </div>
    </div>
  );
}

export function CoachGuidesPanel({
  unitLabel,
  canUseWorkbookActions,
  chatActionsDisabled,
  grammarWorkbookLoading,
  vocabularyWorkbookLoading,
  grammarWorkbookError,
  vocabularyWorkbookError,
  grammarWorkbook,
  vocabularyWorkbook,
  onCreateGrammarWorkbook,
  onCreateVocabularyWorkbook,
  onRequestGrammarGuide,
  onRequestVocabularyGuide,
}: CoachGuidesPanelProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-wide text-blue-300">Guías de estudio</p>
      <p className="mt-1 text-sm text-slate-400">Material descargable para {unitLabel}.</p>
      <div className="mt-3 grid gap-2">
        <button type="button" onClick={onCreateGrammarWorkbook} disabled={grammarWorkbookLoading || !canUseWorkbookActions} className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {grammarWorkbookLoading ? "Generando..." : `Guía de gramática · ${unitLabel}`}
        </button>
        <button type="button" onClick={onCreateVocabularyWorkbook} disabled={vocabularyWorkbookLoading || !canUseWorkbookActions} className="rounded-2xl bg-cyan-600 px-3 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
          {vocabularyWorkbookLoading ? "Generando..." : `Guía de vocabulario · ${unitLabel}`}
        </button>
        <button type="button" onClick={onRequestGrammarGuide} disabled={chatActionsDisabled} className="rounded-2xl border border-emerald-700 px-3 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-950 disabled:opacity-50">
          Explicar gramática en chat
        </button>
        <button type="button" onClick={onRequestVocabularyGuide} disabled={chatActionsDisabled} className="rounded-2xl border border-cyan-700 px-3 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-950 disabled:opacity-50">
          Explicar vocabulario en chat
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {grammarWorkbookError && <div className="rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{grammarWorkbookError}</div>}
        {vocabularyWorkbookError && <div className="rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{vocabularyWorkbookError}</div>}
        <WorkbookCard kind="grammar" workbook={grammarWorkbook} />
        <WorkbookCard kind="vocabulary" workbook={vocabularyWorkbook} />
      </div>
    </section>
  );
}
