import type { CoachQuickHelpPanelModel } from "@/modules/coach-session/viewModels";

type CoachQuickHelpPanelProps = {
  model: CoachQuickHelpPanelModel;
  onSelectAgent: (agentId: string) => void;
  onRunAgent: (agentId: string) => void;
};

export function CoachQuickHelpPanel({ model, onSelectAgent, onRunAgent }: CoachQuickHelpPanelProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-wide text-blue-300">Ayudas rápidas</p>
      <p className="mt-1 text-sm text-slate-400">{model.activeAgentDescription}</p>
      <select value={model.activeAgentId} onChange={(event) => onSelectAgent(event.target.value)} style={{ colorScheme: "dark" }} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500">
        {model.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {model.agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onRunAgent(agent.id)}
            disabled={model.loading}
            className="rounded-2xl border border-slate-700 px-2 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {agent.shortName}
          </button>
        ))}
      </div>
      {model.error && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{model.error}</div>}
    </section>
  );
}
