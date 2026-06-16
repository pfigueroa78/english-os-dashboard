"use client";

import { useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { getQaFetchHeaders, type QaSession } from "@/lib/qaClient";

type ClassPackSummary = {
  ok: boolean;
  title: string;
  retrievalKey: string;
  lessonType: string;
  bookPages: string;
  pdfPages: string;
  sectionNames: string[];
  grammarFocus: string;
  vocabularyFocus: string;
  functions: string;
  targetStructures: string;
  expectedProduction: string;
  specialMode: string;
  studentBookContent: string;
};

const UNIT_4_CLASSES = [
  { label: "Class 22", unit: 4, localClass: 1, globalClass: 22, kind: "Student" },
  { label: "Class 23", unit: 4, localClass: 2, globalClass: 23, kind: "Student" },
  { label: "Class 24", unit: 4, localClass: 3, globalClass: 24, kind: "Grammar+" },
  { label: "Class 25", unit: 4, localClass: 4, globalClass: 25, kind: "Student" },
  { label: "Class 26", unit: 4, localClass: 5, globalClass: 26, kind: "Student" },
  { label: "Class 27", unit: 4, localClass: 6, globalClass: 27, kind: "Grammar+" },
  { label: "Class 28", unit: 4, localClass: 7, globalClass: 28, kind: "Video" },
];

function compactStudentContent(content: string) {
  const cleaned = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !/^~+$/.test(line.trim()))
    .join("\n");
  return cleaned.length > 6000 ? `${cleaned.slice(0, 6000)}\n\n[Contenido recortado para lectura en pantalla.]` : cleaned;
}

function unit4ReviewPrompt() {
  return [
    "Quiero repasar toda la Unidad 4 antes de empezar mi clase actual.",
    "Modo: repaso de unidad. No avances de clase. No apruebes práctica. No cambies mi progreso.",
    "Hazme preguntas una por una sobre Lesson A, Grammar Plus A, Lesson B, Grammar Plus B y Video review.",
  ].join("\n\n");
}

export function QAExperienceTools({ qaSession }: { qaSession: QaSession }) {
  const [selectedClass, setSelectedClass] = useState(UNIT_4_CLASSES[6]);
  const [classOpen, setClassOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [classPack, setClassPack] = useState<ClassPackSummary | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState("");
  const [messages, setMessages] = useState([{ role: "coach", content: "QA Coach integrado listo. Misma UI de estudiante; sin cambios reales de progreso." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const qaHeaders = getQaFetchHeaders(qaSession);

  async function loadClassMaterial(target = selectedClass) {
    setClassOpen(true);
    setClassLoading(true);
    setClassError("");
    setSelectedClass(target);

    try {
      const params = new URLSearchParams({
        unit: String(target.unit),
        localClass: String(target.localClass),
        globalClass: String(target.globalClass),
      });
      const response = await fetch(`/api/english-os/class-pack?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: qaHeaders,
      });
      const data = await response.json();
      if (!response.ok || !data.currentClassPack) throw new Error(data.error || "Class material could not be loaded.");
      setClassPack(data.currentClassPack);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : "Unknown class material error");
    } finally {
      setClassLoading(false);
    }
  }

  async function sendMessage(custom?: string) {
    const message = (custom || input).trim();
    if (!message || loading) return;
    setInput("");
    setCoachOpen(true);
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/english-os/coach-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...qaHeaders },
        cache: "no-store",
        body: JSON.stringify({ message, conversationHistory: messages.slice(-12) }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Coach request failed.");
      setMessages((current) => [...current, { role: "coach", content: data.reply || "No response returned." }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown coach error";
      setMessages((current) => [...current, { role: "coach", content: `No pude completar la solicitud: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const isVideoClass = (classPack?.lessonType || selectedClass.kind).toLowerCase().includes("video");

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:flex-row sm:items-center">
        <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-200 shadow-2xl shadow-black/30">
          QA mode
        </span>
        <button type="button" onClick={() => loadClassMaterial(selectedClass)} className="rounded-full border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-100 shadow-2xl shadow-black/30 hover:bg-slate-800">
          Ver clase
        </button>
        <button type="button" onClick={() => setCoachOpen((current) => !current)} className="rounded-full bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-2xl shadow-black/40 hover:bg-sky-300">
          {coachOpen ? "Cerrar Coach" : "Coach integrado"}
        </button>
      </div>

      {classOpen && (
        <section className="fixed inset-x-3 top-4 z-40 flex max-h-[82dvh] flex-col rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl shadow-black/40 lg:left-12 lg:right-12">
          <header className="border-b border-slate-700 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Class material</p>
                <h2 className="mt-1 text-xl font-bold">{classPack?.title || `${selectedClass.label} — ${selectedClass.kind}`}</h2>
                <p className="mt-1 text-sm text-slate-400">{classPack?.lessonType || selectedClass.kind} · Book pages {classPack?.bookPages || "—"} · PDF pages {classPack?.pdfPages || "—"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {UNIT_4_CLASSES.map((item) => (
                  <button key={item.globalClass} type="button" onClick={() => loadClassMaterial(item)} disabled={classLoading} className={`rounded-2xl border px-3 py-2 text-xs font-bold ${selectedClass.globalClass === item.globalClass ? "border-sky-400 bg-sky-400/10" : "border-slate-700 hover:bg-slate-800"}`}>{item.label}</button>
                ))}
                <button type="button" onClick={() => setClassOpen(false)} className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800">Cerrar</button>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {classLoading && <p className="text-sm text-slate-400">Loading class material...</p>}
            {classError && <p className="rounded-2xl border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-200">{classError}</p>}
            {classPack && !classLoading && (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                <div className="space-y-4">
                  <Panel title="What this class teaches">
                    <Info label="Grammar focus" value={classPack.grammarFocus || "Not specified in this pack."} />
                    <Info label="Vocabulary focus" value={classPack.vocabularyFocus || "Not specified in this pack."} />
                    <Info label="Functions" value={classPack.functions || "Not specified in this pack."} />
                    <Info label="Expected production" value={classPack.expectedProduction || "Not specified in this pack."} />
                  </Panel>
                  <Panel title="Target structures">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{classPack.targetStructures || "No target structures were indexed for this class."}</p>
                  </Panel>
                  {isVideoClass ? (
                    <Panel title="Video Class mode">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-amber-100">{classPack.specialMode || "This is a Video Class. Use the Drive video/resource when available and do not invent a transcript."}</p>
                    </Panel>
                  ) : (
                    <Panel title="Student Book content">
                      <pre className="mt-3 max-h-[460px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm leading-6 text-slate-100">{compactStudentContent(classPack.studentBookContent) || "No direct Student Book text is indexed for this class."}</pre>
                    </Panel>
                  )}
                </div>
                <aside className="space-y-4">
                  <Panel title="Sections">
                    <div className="flex flex-wrap gap-2">{(classPack.sectionNames.length ? classPack.sectionNames : ["No sections indexed"]).map((section) => <span key={section} className="rounded-full bg-sky-400/10 px-3 py-1 text-sm">{section}</span>)}</div>
                  </Panel>
                  <button type="button" onClick={() => { setClassOpen(false); sendMessage(`Usa el class pack ${classPack.retrievalKey} para enseñarme esta clase como profesor. No avances progreso. Primero resume el objetivo y luego hazme la primera pregunta.`); }} disabled={loading} className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
                    Enseñar esta clase con Coach
                  </button>
                </aside>
              </div>
            )}
          </div>
        </section>
      )}

      {coachOpen && (
        <section className="fixed inset-x-3 bottom-20 z-40 flex max-h-[78dvh] flex-col rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl shadow-black/40 sm:left-auto sm:right-4 sm:w-[480px]">
          <header className="border-b border-slate-700 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">English OS</p>
                <h2 className="mt-1 text-lg font-bold">Coach integrado · QA</h2>
                <p className="mt-1 text-xs text-slate-400">No sales del dashboard. No cambia progreso real.</p>
              </div>
              <button type="button" onClick={() => setCoachOpen(false)} className="rounded-full border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800" aria-label="Cerrar Coach">×</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => sendMessage(unit4ReviewPrompt())} disabled={loading} className="rounded-2xl border border-slate-700 px-2 py-2 text-xs font-bold hover:bg-slate-800 disabled:opacity-50">Repasar U4</button>
              <button type="button" onClick={() => sendMessage("Hazme un quiz rápido de la Unidad 4 antes de empezar la clase.")} disabled={loading} className="rounded-2xl border border-slate-700 px-2 py-2 text-xs font-bold hover:bg-slate-800 disabled:opacity-50">Quiz U4</button>
              <button type="button" onClick={() => sendMessage("Dame mi clase actual usando el contenido real del libro, pero como profesor.")} disabled={loading} className="rounded-2xl border border-slate-700 px-2 py-2 text-xs font-bold hover:bg-slate-800 disabled:opacity-50">Clase actual</button>
            </div>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`rounded-3xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-auto max-w-[88%] bg-sky-400 text-slate-950" : "mr-auto max-w-[94%] border border-slate-700 bg-slate-800 text-slate-100"}`}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-75">{message.role === "user" ? "You" : "Coach"}</div>
                <div className="prose max-w-none text-sm leading-6 text-inherit"><MarkdownMessage content={message.content} /></div>
              </article>
            ))}
            {loading && <div className="mr-auto max-w-[90%] rounded-3xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-400">Coach is thinking...</div>}
          </div>
          <footer className="border-t border-slate-700 p-3">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Escribe al Coach sin salir de esta UI..." className="min-h-20 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-sky-400" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => sendMessage()} disabled={loading || !input.trim()} className="flex-1 rounded-2xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{loading ? "..." : "Enviar"}</button>
              <button type="button" onClick={() => setMessages([{ role: "coach", content: "Conversación reiniciada en QA mode." }])} disabled={loading} className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-bold hover:bg-slate-800 disabled:opacity-50">Limpiar</button>
            </div>
          </footer>
        </section>
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4"><h3 className="font-bold text-slate-100">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm leading-6 text-slate-200">{value}</p></div>;
}
