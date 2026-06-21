export type CoachClassResource = {
  resourceId: string;
  title: string;
  description: string;
  type: "audio" | "video" | "document" | "link";
  unitNumber: number;
  unitCode: string;
  url: string;
  embedUrl?: string;
  provider: string;
};

type CoachClassMaterialsPanelProps = {
  unitLabel: string;
  resources: CoachClassResource[];
  resourcesLoading: boolean;
  resourcesNotice: string;
  resourcesError: string;
  expandedResourceId: string | null;
  practiceDisabled: boolean;
  onToggleResource: (resourceId: string) => void;
  onPracticeResource: (resource: CoachClassResource) => void;
};

export function CoachClassMaterialsPanel({
  unitLabel,
  resources,
  resourcesLoading,
  resourcesNotice,
  resourcesError,
  expandedResourceId,
  practiceDisabled,
  onToggleResource,
  onPracticeResource,
}: CoachClassMaterialsPanelProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
      <h3 className="text-sm font-bold text-slate-100">Materiales de clase</h3>
      <p className="mt-1 text-xs text-slate-400">Audios, videos y documentos para {unitLabel}.</p>
      {resourcesLoading && <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">Loading resources...</div>}
      {resourcesNotice && <div className="mt-3 rounded-2xl border border-slate-300 bg-white/70 p-4 text-sm leading-6 text-slate-600">{resourcesNotice}</div>}
      {resourcesError && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{resourcesError}</div>}
      {!resourcesLoading && !resourcesError && !resourcesNotice && resources.length === 0 && <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">No hay materiales cargados para esta unidad.</div>}
      <div className="mt-3 min-w-0 max-w-full space-y-3">
        {resources.map((resource) => (
          <div key={resource.resourceId} data-testid="resource-card" className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 break-all text-sm font-semibold text-slate-100" title={resource.title}>{resource.title}</h3>
              <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase text-slate-400">{resource.type}</span>
            </div>
            <p className="mb-3 break-words text-xs leading-5 text-slate-400">{resource.description}</p>
            {resource.embedUrl && (
              <button
                type="button"
                onClick={() => onToggleResource(resource.resourceId)}
                className="mb-3 w-full rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                aria-expanded={expandedResourceId === resource.resourceId}
              >
                {expandedResourceId === resource.resourceId ? "Ocultar reproductor" : "Cargar reproductor"}
              </button>
            )}
            {expandedResourceId === resource.resourceId && resource.type === "audio" && resource.embedUrl && (
              <div className="mb-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black">
                <iframe src={resource.embedUrl} title={resource.title} className="block h-20 w-full min-w-0 max-w-full border-0" allow="autoplay" loading="lazy" />
              </div>
            )}
            {expandedResourceId === resource.resourceId && resource.type === "video" && resource.embedUrl && (
              <div className="mb-3 aspect-video min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black">
                <iframe src={resource.embedUrl} title={resource.title} className="block h-full w-full min-w-0 max-w-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              </div>
            )}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <a href={resource.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-700 px-3 py-2 text-center text-sm font-semibold hover:bg-slate-800">
                Abrir
              </a>
              <button type="button" onClick={() => onPracticeResource(resource)} disabled={practiceDisabled} className="rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
                Practicar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
