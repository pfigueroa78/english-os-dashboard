"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";

type ComfortTheme = "dark" | "warm" | "blue" | "light";

type Message = {
  role: "user" | "coach";
  content: string;
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: number;
  };
};

type ClassPackSummary = {
  ok: boolean;
  unit: number;
  localClass: number;
  globalClass: number;
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
  sourceStatus: string;
  specialMode: string;
  studentBookContent: string;
  fullMarkdown: string;
  message?: string;
};

const THEME_OPTIONS: { id: ComfortTheme; label: string; description: string }[] = [
  { id: "dark", label: "Dark", description: "Alto contraste para sesiones cortas." },
  { id: "warm", label: "Warm paper", description: "Fondo cálido para leer por más tiempo." },
  { id: "blue", label: "Soft blue", description: "Azul suave para estudio nocturno." },
  { id: "light", label: "Light", description: "Claro y limpio para trabajo largo." },
];

const UNIT_4_CLASSES = [
  { label: "Class 22", unit: 4, localClass: 1, globalClass: 22, kind: "Student" },
  { label: "Class 23", unit: 4, localClass: 2, globalClass: 23, kind: "Student" },
  { label: "Class 24", unit: 4, localClass: 3, globalClass: 24, kind: "Grammar+" },
  { label: "Class 25", unit: 4, localClass: 4, globalClass: 25, kind: "Student" },
  { label: "Class 26", unit: 4, localClass: 5, globalClass: 26, kind: "Student" },
  { label: "Class 27", unit: 4, localClass: 6, globalClass: 27, kind: "Grammar+" },
  { label: "Class 28", unit: 4, localClass: 7, globalClass: 28, kind: "Video" },
];

function buildUnit4ReviewPrompt() {
  return [
    "Quiero repasar toda la Unidad 4 antes de empezar mi clase actual.",
    "",
    "Modo: repaso de unidad.",
    "No avances de clase.",
    "No apruebes práctica.",
    "No cambies mi progreso.",
    "",
    "Hazme preguntas una por una sobre:",
    "1. Lesson A: best time of day, routines, time clauses.",
    "2. Grammar Plus A: as soon as, after, before, until, whenever, ever since.",
    "3. Lesson B: hábitos, preferencias y productividad.",
    "4. Grammar Plus B: preferences, routines, advice-style sentences.",
    "5. Video / communication review.",
    "",
    "Corrige mis respuestas en español e inglés.",
    "Al final dime si estoy listo para continuar.",
  ].join("\n");
}

function buildCurrentClassPrompt() {
  return [
    "Dame mi clase actual usando el contenido real del libro, pero como profesor.",
    "Enséñala paso a paso, sin avanzar mi progreso automáticamente.",
    "Termina con una evaluación antes de aprobar cualquier práctica.",
  ].join("\n");
}

function buildQuickQuizPrompt() {
  return [
    "Hazme un quiz rápido de la Unidad 4 antes de empezar la clase.",
    "Dame 10 preguntas: 4 de grammar, 3 de vocabulary y 3 de speaking.",
    "Pregunta una por una, corrige mis respuestas y al final dime si estoy listo para continuar.",
    "No avances de clase ni apruebes práctica.",
  ].join("\n");
}

function getInitialTheme(): ComfortTheme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("english-os-comfort-theme") as ComfortTheme | null;
  return THEME_OPTIONS.some((option) => option.id === saved) ? saved || "dark" : "dark";
}

function compactStudentContent(content: string) {
  const cleaned = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !/^~+$/.test(line.trim()))
    .join("\n");

  return cleaned.length > 6000 ? `${cleaned.slice(0, 6000)}\n\n[Contenido recortado para lectura en pantalla.]` : cleaned;
}

export function AppExperienceLayer() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const [theme, setTheme] = useState<ComfortTheme>("dark");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [classMaterialOpen, setClassMaterialOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(UNIT_4_CLASSES[6]);
  const [classPack, setClassPack] = useState<ClassPackSummary | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "coach",
      content:
        "Coach integrado listo. Puedes repasar una unidad, continuar la clase actual o hacer un quiz sin salir del dashboard.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const email = useMemo(
    () => user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "",
    [user]
  );

  const storageKey = email ? `english-os-integrated-coach:${email}` : "";

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.comfortTheme = theme;
    window.localStorage.setItem("english-os-comfort-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Message[];
      if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });

    if (storageKey && messages.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    }
  }, [messages, loading, storageKey]);

  async function loadClassMaterial(target = selectedClass) {
    setClassMaterialOpen(true);
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
      });
      const data = await response.json();
      if (!response.ok || !data.currentClassPack) {
        throw new Error(data.error || "Class material could not be loaded.");
      }
      setClassPack(data.currentClassPack);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : "Unknown class material error");
    } finally {
      setClassLoading(false);
    }
  }

  async function sendMessage(customMessage?: string) {
    const message = (customMessage || input).trim();
    if (!message || loading) return;

    const conversationHistory = messages.slice(-12);
    setInput("");
    setError("");
    setLoading(true);
    setCoachOpen(true);

    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/english-os/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ message, conversationHistory }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Coach request failed.");
      }

      setMessages((current) => [
        ...current,
        { role: "coach", content: data.reply || "No response returned.", usage: data.usage },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown coach error";
      setError(message);
      setMessages((current) => [
        ...current,
        { role: "coach", content: `No pude completar la solicitud: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    setMessages([
      {
        role: "coach",
        content:
          "Conversación reiniciada. Puedes repasar una unidad, continuar la clase actual o hacer un quiz sin salir del dashboard.",
      },
    ]);
    setInput("");
    setError("");
  }

  if (!isLoaded || !isSignedIn) return null;
  if (pathname?.startsWith("/coach")) return null;
  if (pathname?.startsWith("/api")) return null;

  const currentTheme = THEME_OPTIONS.find((option) => option.id === theme) || THEME_OPTIONS[0];
  const isVideoClass = (classPack?.lessonType || selectedClass.kind).toLowerCase().includes("video");

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:flex-row sm:items-center">
        {themeMenuOpen && (
          <div className="w-72 rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface)] p-3 text-[var(--comfort-text)] shadow-2xl shadow-black/30">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--comfort-muted)]">Fondo de lectura</p>
            <div className="mt-2 grid gap-2">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setTheme(option.id);
                    setThemeMenuOpen(false);
                  }}
                  className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    theme === option.id
                      ? "border-[var(--comfort-accent)] bg-[var(--comfort-accent-soft)]"
                      : "border-[var(--comfort-border)] hover:bg-[var(--comfort-surface-muted)]"
                  }`}
                >
                  <span className="font-bold">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--comfort-muted)]">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setThemeMenuOpen((current) => !current)}
          className="rounded-full border border-[var(--comfort-border)] bg-[var(--comfort-surface)] px-4 py-3 text-sm font-bold text-[var(--comfort-text)] shadow-2xl shadow-black/30 hover:bg-[var(--comfort-surface-muted)]"
        >
          Tema: {currentTheme.label}
        </button>

        <button
          type="button"
          onClick={() => loadClassMaterial(selectedClass)}
          className="rounded-full border border-[var(--comfort-border)] bg-[var(--comfort-surface)] px-4 py-3 text-sm font-bold text-[var(--comfort-text)] shadow-2xl shadow-black/30 hover:bg-[var(--comfort-surface-muted)]"
        >
          Ver clase
        </button>

        <button
          type="button"
          onClick={() => setCoachOpen((current) => !current)}
          className="rounded-full bg-[var(--comfort-accent)] px-5 py-3 text-sm font-bold text-[var(--comfort-accent-contrast)] shadow-2xl shadow-black/40 hover:opacity-95"
        >
          {coachOpen ? "Cerrar Coach" : "Coach integrado"}
        </button>
      </div>

      {classMaterialOpen && (
        <section className="fixed inset-x-3 top-4 z-40 flex max-h-[82dvh] flex-col rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface)] text-[var(--comfort-text)] shadow-2xl shadow-black/40 lg:left-12 lg:right-12">
          <header className="border-b border-[var(--comfort-border)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--comfort-accent)]">Class material</p>
                <h2 className="mt-1 text-xl font-bold">
                  {classPack?.title || `${selectedClass.label} — ${selectedClass.kind}`}
                </h2>
                <p className="mt-1 text-sm text-[var(--comfort-muted)]">
                  {classPack?.lessonType || selectedClass.kind} · Book pages {classPack?.bookPages || "—"} · PDF pages {classPack?.pdfPages || "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {UNIT_4_CLASSES.map((item) => (
                  <button
                    key={item.globalClass}
                    type="button"
                    onClick={() => loadClassMaterial(item)}
                    disabled={classLoading}
                    className={`rounded-2xl border px-3 py-2 text-xs font-bold ${
                      selectedClass.globalClass === item.globalClass
                        ? "border-[var(--comfort-accent)] bg-[var(--comfort-accent-soft)]"
                        : "border-[var(--comfort-border)] hover:bg-[var(--comfort-surface-muted)]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setClassMaterialOpen(false)}
                  className="rounded-2xl border border-[var(--comfort-border)] px-3 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {classLoading && <p className="text-sm text-[var(--comfort-muted)]">Loading class material...</p>}
            {classError && <p className="rounded-2xl border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-500">{classError}</p>}

            {classPack && !classLoading && (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] p-4">
                    <h3 className="text-lg font-bold">What this class teaches</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <InfoBlock label="Grammar focus" value={classPack.grammarFocus || "Not specified in this pack."} />
                      <InfoBlock label="Vocabulary focus" value={classPack.vocabularyFocus || "Not specified in this pack."} />
                      <InfoBlock label="Functions" value={classPack.functions || "Not specified in this pack."} />
                      <InfoBlock label="Expected production" value={classPack.expectedProduction || "Not specified in this pack."} />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] p-4">
                    <h3 className="text-lg font-bold">Target structures</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--comfort-text)]">
                      {classPack.targetStructures || "No target structures were indexed for this class."}
                    </p>
                  </div>

                  {isVideoClass ? (
                    <div className="rounded-3xl border border-amber-500/40 bg-amber-950/20 p-4">
                      <h3 className="text-lg font-bold text-amber-600">Video Class mode</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {classPack.specialMode ||
                          "This is a Video Class. The app should use the Drive video/resource when available and must not invent a transcript."}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] p-4">
                      <h3 className="text-lg font-bold">Student Book content</h3>
                      <pre className="mt-3 max-h-[460px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[var(--comfort-border)] bg-[var(--comfort-input)] p-4 text-sm leading-6 text-[var(--comfort-text)]">
                        {compactStudentContent(classPack.studentBookContent) || "No direct Student Book text is indexed for this class."}
                      </pre>
                    </div>
                  )}
                </div>

                <aside className="space-y-4">
                  <div className="rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] p-4">
                    <h3 className="text-lg font-bold">Sections</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(classPack.sectionNames.length ? classPack.sectionNames : ["No sections indexed"]).map((section) => (
                        <span key={section} className="rounded-full bg-[var(--comfort-accent-soft)] px-3 py-1 text-sm">
                          {section}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] p-4">
                    <h3 className="text-lg font-bold">How to use this screen</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--comfort-muted)]">
                      For a Student Book class, this panel shows the indexed book content. For a Video Class, it shows the video-mode contract and discussion objectives because no transcript is indexed.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setClassMaterialOpen(false);
                      setCoachOpen(true);
                      sendMessage(
                        `Usa el class pack ${classPack.retrievalKey} para enseñarme esta clase como profesor. No avances progreso. Primero resume el objetivo y luego hazme la primera pregunta.`
                      );
                    }}
                    disabled={loading}
                    className="w-full rounded-2xl bg-[var(--comfort-accent)] px-4 py-3 text-sm font-bold text-[var(--comfort-accent-contrast)] disabled:opacity-50"
                  >
                    Enseñar esta clase con Coach
                  </button>
                </aside>
              </div>
            )}
          </div>
        </section>
      )}

      {coachOpen && (
        <section className="fixed inset-x-3 bottom-20 z-40 flex max-h-[78dvh] flex-col rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface)] text-[var(--comfort-text)] shadow-2xl shadow-black/40 sm:left-auto sm:right-4 sm:w-[480px]">
          <header className="border-b border-[var(--comfort-border)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--comfort-accent)]">English OS</p>
                <h2 className="mt-1 text-lg font-bold">Coach integrado</h2>
                <p className="mt-1 text-xs text-[var(--comfort-muted)]">No sales del dashboard. No avanza progreso sin aprobación.</p>
              </div>
              <button
                type="button"
                onClick={() => setCoachOpen(false)}
                className="rounded-full border border-[var(--comfort-border)] px-3 py-1 text-sm hover:bg-[var(--comfort-surface-muted)]"
                aria-label="Cerrar Coach"
              >
                ×
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => sendMessage(buildUnit4ReviewPrompt())} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-2 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
                Repasar U4
              </button>
              <button type="button" onClick={() => sendMessage(buildQuickQuizPrompt())} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-2 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
                Quiz U4
              </button>
              <button type="button" onClick={() => sendMessage(buildCurrentClassPrompt())} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-2 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
                Clase actual
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`rounded-3xl p-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto max-w-[88%] bg-[var(--comfort-accent)] text-[var(--comfort-accent-contrast)]"
                    : "mr-auto max-w-[94%] border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] text-[var(--comfort-text)]"
                }`}
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-75">{message.role === "user" ? "You" : "Coach"}</div>
                <div className="prose max-w-none text-sm leading-6 text-inherit">
                  <MarkdownMessage content={message.content} />
                </div>
                {message.usage && (
                  <p className="mt-2 text-[10px] opacity-70">
                    {message.usage.totalTokens} tokens · ${message.usage.estimatedCostUSD.toFixed(6)}
                  </p>
                )}
              </article>
            ))}

            {loading && (
              <div className="mr-auto max-w-[90%] rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface-muted)] p-3 text-sm text-[var(--comfort-muted)]">
                Coach is thinking...
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <footer className="border-t border-[var(--comfort-border)] p-3">
            {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Escribe al Coach sin salir de esta UI..."
              className="min-h-20 w-full resize-none rounded-2xl border border-[var(--comfort-border)] bg-[var(--comfort-input)] p-3 text-sm text-[var(--comfort-text)] outline-none focus:border-[var(--comfort-accent)]"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => sendMessage()} disabled={loading || !input.trim()} className="flex-1 rounded-2xl bg-[var(--comfort-accent)] px-4 py-3 text-sm font-bold text-[var(--comfort-accent-contrast)] disabled:opacity-50">
                {loading ? "..." : "Enviar"}
              </button>
              <button type="button" onClick={clearConversation} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-4 py-3 text-sm font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
                Limpiar
              </button>
            </div>
          </footer>
        </section>
      )}
    </>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--comfort-border)] bg-[var(--comfort-input)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--comfort-muted)]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--comfort-text)]">{value}</p>
    </div>
  );
}
