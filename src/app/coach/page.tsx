"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { MarkdownMessage } from "@/components/MarkdownMessage";

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

type DriveUnitResource = {
  resourceId: string;
  title: string;
  description: string;
  type: "audio" | "video" | "document" | "link";
  unitNumber: number;
  unitCode: string;
  section?: string;
  page?: string;
  exercise?: string;
  exercisePart?: string;
  url: string;
  embedUrl?: string;
  provider: string;
  mimeType?: string;
  order?: number;
};

type Workbook = {
  title: string;
  fileUrl: string;
  exportUrl: string;
  generatedAt?: string;
};

type AgentId = "grammar_corrector" | "speaking_partner" | "english_evaluator";

type SpecialistAgent = {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  defaultPrompt: string;
};

const E2E_DEMO = process.env.NEXT_PUBLIC_E2E_DEMO === "1";
const DEMO_UNIT = "Unit 1";
const DEMO_LESSON = "Business advice speaking practice";
const PROGRESS_STATUS = "Evaluación pendiente";

const SPECIALIST_AGENTS: SpecialistAgent[] = [
  {
    id: "grammar_corrector",
    name: "Corrector de gramática",
    shortName: "Gramática",
    description: "Corrige estructura, artículos, preposiciones y naturalidad.",
    defaultPrompt:
      "Please correct my English. Focus on grammar, sentence structure, articles, prepositions, fluency, and natural professional phrasing.",
  },
  {
    id: "speaking_partner",
    name: "Compañero de speaking",
    shortName: "Speaking",
    description: "Practica conversación, fluidez y respuestas profesionales.",
    defaultPrompt:
      "Let's practice speaking in a business context. Ask me one realistic question and correct important mistakes after my answer.",
  },
  {
    id: "english_evaluator",
    name: "Evaluador B1/B2",
    shortName: "Evaluar",
    description: "Evalúa CEFR, precisión, vocabulario y próximos pasos.",
    defaultPrompt:
      "Please evaluate my English objectively using CEFR criteria. Give me a score, weaknesses, recurring patterns, and targeted exercises.",
  },
];

function extractUnitNumber(value: string) {
  const match = String(value || "").match(/(\d{1,2})/);
  return match?.[1] || "";
}

function unitLabel(value: string) {
  const number = extractUnitNumber(value);
  return number ? `Unit ${number}` : value || "Current unit";
}

function buildTodayClassMessage(unit: string, lesson: string) {
  return [
    "Hola, Pedro. Soy tu profesor de English OS y hoy vamos a trabajar paso a paso.",
    "",
    `Unidad activa: ${unitLabel(unit)}`,
    `Clase / lección actual: ${lesson || "Clase guiada de English OS"}`,
    "",
    "Puedes empezar la explicación, pedir una pista, practicar gramática o responder la evaluación pendiente. Yo mantengo el avance bloqueado hasta que la evaluación quede aprobada.",
  ].join("\n");
}

function buildStartTodayClassPrompt(unit: string, lesson: string) {
  const unitNumber = extractUnitNumber(unit);
  return [
    unitNumber
      ? `Dame la clase actual de la unidad ${unitNumber} usando el contenido real del libro, pero como profesor.`
      : "Dame mi clase actual usando el contenido real del libro, pero como profesor.",
    lesson ? `Current lesson/class context: ${lesson}` : "",
    "Teach it step by step, use the real section names, and finish with an evaluation gate before progress can advance.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHintPrompt(unit: string, lesson: string) {
  return [
    "Dame una pista corta, no la respuesta completa.",
    `Unidad: ${unitLabel(unit)}`,
    lesson ? `Clase: ${lesson}` : "",
    "La pista debe ayudarme a responder la evaluación en inglés.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUnitGrammarPrompt(unit: string) {
  const number = extractUnitNumber(unit);
  return [
    number ? `Dame una guía de gramática de la unidad ${number}.` : "Dame una guía de gramática de mi unidad actual.",
    "Usa mi contexto de English OS y el contenido real del curso cuando esté disponible.",
    "Organiza la respuesta por clases/secciones reales de la unidad. Incluye estructuras, reglas en español, ejemplos en inglés, errores frecuentes, tips B1/B2 y una evaluación corta al final.",
  ].join(" ");
}

function buildUnitVocabularyPrompt(unit: string) {
  const number = extractUnitNumber(unit);
  return [
    number ? `Dame una guía de vocabulario de la unidad ${number}.` : "Dame una guía de vocabulario de mi unidad actual.",
    "Usa mi contexto de English OS y el contenido real del curso cuando esté disponible.",
    "Organiza el vocabulario por clases/secciones reales de la unidad. Incluye chunks, collocations, significado en español, ejemplos en inglés, tips de pronunciación y práctica corta al final.",
  ].join(" ");
}

function initialCoachMessages(): Message[] {
  return [
    {
      role: "coach",
      content: E2E_DEMO ? buildTodayClassMessage(DEMO_UNIT, DEMO_LESSON) : "Loading your English OS class plan...",
    },
  ];
}

export default function CoachPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const signedIn = isSignedIn || E2E_DEMO;
  const email = user?.primaryEmailAddress?.emailAddress || "pfigueroamiranda@gmail.com";

  const [messages, setMessages] = useState<Message[]>(initialCoachMessages);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [error, setError] = useState("");
  const [agentError, setAgentError] = useState("");
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("grammar_corrector");
  const [currentUnit, setCurrentUnit] = useState(E2E_DEMO ? DEMO_UNIT : "");
  const [currentLesson, setCurrentLesson] = useState(E2E_DEMO ? DEMO_LESSON : "");
  const [studyUnit, setStudyUnit] = useState(E2E_DEMO ? DEMO_UNIT : "");
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [resources, setResources] = useState<DriveUnitResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState("");
  const [grammarWorkbook, setGrammarWorkbook] = useState<Workbook | null>(null);
  const [grammarWorkbookLoading, setGrammarWorkbookLoading] = useState(false);
  const [grammarWorkbookError, setGrammarWorkbookError] = useState("");
  const [vocabularyWorkbook, setVocabularyWorkbook] = useState<Workbook | null>(null);
  const [vocabularyWorkbookLoading, setVocabularyWorkbookLoading] = useState(false);
  const [vocabularyWorkbookError, setVocabularyWorkbookError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeAgent = SPECIALIST_AGENTS.find((agent) => agent.id === activeAgentId) || SPECIALIST_AGENTS[0];
  const activeStudyUnit = studyUnit || currentUnit;
  const activeStudyUnitLabel = unitLabel(activeStudyUnit);
  const conversationStorageKey = email ? `english-os-coach:${email}` : "";

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (conversationStorageKey && messages.length > 0 && !E2E_DEMO) {
      window.localStorage.setItem(conversationStorageKey, JSON.stringify(messages.slice(-40)));
    }
  }, [messages, loading, agentLoading, conversationStorageKey]);

  useEffect(() => {
    if (E2E_DEMO) return;
    if (!isLoaded || !signedIn) return;

    if (conversationStorageKey) {
      const saved = window.localStorage.getItem(conversationStorageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Message[];
          if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
        } catch {
          window.localStorage.removeItem(conversationStorageKey);
        }
      }
    }

    loadUserContext();
  }, [isLoaded, signedIn, conversationStorageKey]);

  useEffect(() => {
    if (!activeStudyUnit || E2E_DEMO) return;
    loadDriveUnitResources(activeStudyUnit);
  }, [activeStudyUnit]);

  async function loadUserContext() {
    setContextLoading(true);
    setContextError("");
    try {
      const response = await fetch("/api/english-os/context", { method: "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to load English OS context.");

      const missionControl = data.context?.missionControl || data.missionControl || data.context || {};
      const unit = missionControl.currentUnit || missionControl.CurrentUnit || missionControl.unit || "";
      const lesson = missionControl.currentLesson || missionControl.CurrentLesson || missionControl.lesson || "";

      if (unit) {
        setCurrentUnit(unit);
        setStudyUnit((current) => current || unit);
      }
      if (lesson) setCurrentLesson(lesson);

      setMessages((current) => {
        const shouldReplace = current.length === 1 && current[0]?.content.includes("Loading your English OS class plan");
        return shouldReplace ? [{ role: "coach", content: buildTodayClassMessage(unit, lesson) }] : current;
      });
    } catch (err) {
      setContextError(err instanceof Error ? err.message : "Unknown context error");
    } finally {
      setContextLoading(false);
    }
  }

  async function loadDriveUnitResources(unit: string) {
    setResourcesLoading(true);
    setResourcesError("");
    try {
      const params = new URLSearchParams({ unit });
      const response = await fetch(`/api/english-os/drive-unit-resources?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to load unit resources.");
      setResources(data.resources || []);
    } catch (err) {
      setResourcesError(err instanceof Error ? err.message : "Unknown resources error");
    } finally {
      setResourcesLoading(false);
    }
  }

  async function createWorkbook(kind: "grammar" | "vocabulary") {
    const isGrammar = kind === "grammar";
    const unit = activeStudyUnit;
    if (!unit || E2E_DEMO) return;

    if (isGrammar) {
      if (grammarWorkbookLoading) return;
      setGrammarWorkbookLoading(true);
      setGrammarWorkbookError("");
    } else {
      if (vocabularyWorkbookLoading) return;
      setVocabularyWorkbookLoading(true);
      setVocabularyWorkbookError("");
    }

    setError("");
    try {
      const params = new URLSearchParams({ unit, lesson: currentLesson });
      const endpoint = isGrammar ? "/api/english-os/grammar-workbook" : "/api/english-os/vocabulary-workbook";
      const response = await fetch(`${endpoint}?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `Failed to create ${kind} workbook.`);

      const workbook: Workbook = {
        title: data.title,
        fileUrl: data.fileUrl,
        exportUrl: data.exportUrl,
        generatedAt: data.generatedAt,
      };

      if (isGrammar) setGrammarWorkbook(workbook);
      else setVocabularyWorkbook(workbook);

      window.open(data.exportUrl || data.fileUrl, "_blank", "noopener,noreferrer");
      setMessages((current) => [
        ...current,
        { role: "coach", content: `Listo. Generé la guía de ${isGrammar ? "gramática" : "vocabulario"} para ${unitLabel(unit)}.` },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown workbook error";
      if (isGrammar) setGrammarWorkbookError(message);
      else setVocabularyWorkbookError(message);
      setError(message);
    } finally {
      if (isGrammar) setGrammarWorkbookLoading(false);
      else setVocabularyWorkbookLoading(false);
    }
  }

  async function sendAgentMessage(customMessage?: string) {
    const message = (customMessage || input || activeAgent.defaultPrompt).trim();
    if (!message || agentLoading) return;

    if (E2E_DEMO) {
      setMessages((current) => [
        ...current,
        { role: "user", content: `[${activeAgent.name}] ${message}` },
        { role: "coach", content: `${activeAgent.name}\n\nModo demo: aquí aparecería la retroalimentación especializada.` },
      ]);
      return;
    }

    setError("");
    setAgentError("");
    setInput("");
    setAgentLoading(true);
    setMessages((current) => [...current, { role: "user", content: `[${activeAgent.name}] ${message}` }]);

    try {
      const response = await fetch("/api/english-os/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent.id, message }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Specialist agent request failed.");
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: `${data.agent?.name || activeAgent.name}\n\n${data.reply || "No response returned."}`,
          usage: data.usage,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown agent error";
      setAgentError(message);
      setError(message);
    } finally {
      setAgentLoading(false);
    }
  }

  async function sendMessage(customMessage?: string) {
    const message = (customMessage || input).trim();
    if (!message || loading) return;

    if (E2E_DEMO) {
      setInput("");
      setMessages((current) => [
        ...current,
        { role: "user", content: message },
        { role: "coach", content: "Modo demo: el profesor respondería aquí usando el contexto real de la clase." },
      ]);
      return;
    }

    setError("");
    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: message }]);

    try {
      const response = await fetch("/api/english-os/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationHistory: messages.slice(-12) }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Coach request failed.");

      const missionControl = data.context?.missionControl || data.missionControl || data.context || {};
      const unit = data.activeUnit ? `Unit ${data.activeUnit}` : missionControl.currentUnit || missionControl.CurrentUnit || missionControl.unit || "";
      const lesson = missionControl.currentLesson || missionControl.CurrentLesson || missionControl.lesson || "";

      if (unit) {
        setCurrentUnit(unit);
        setStudyUnit(unit);
      }
      if (lesson) setCurrentLesson(lesson);

      setMessages((current) => [
        ...current,
        { role: "coach", content: data.reply || "No response returned.", usage: data.usage },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function startTodayClass() {
    sendMessage(buildStartTodayClassPrompt(activeStudyUnit, currentLesson));
  }

  function requestUnitGrammar() {
    sendMessage(buildUnitGrammarPrompt(activeStudyUnit));
  }

  function requestUnitVocabulary() {
    sendMessage(buildUnitVocabularyPrompt(activeStudyUnit));
  }

  function requestHint() {
    sendMessage(buildHintPrompt(activeStudyUnit, currentLesson));
  }

  function requestResourcePractice(resource: DriveUnitResource) {
    const details = [
      `Title: ${resource.title}`,
      `Type: ${resource.type}`,
      resource.section ? `Section: ${resource.section}` : "",
      resource.page ? `Page: ${resource.page}` : "",
      resource.exercise ? `Exercise: ${resource.exercise}${resource.exercisePart || ""}` : "",
      `URL: ${resource.url}`,
    ]
      .filter(Boolean)
      .join("\n");
    sendMessage(`Vamos a trabajar con este recurso de ${activeStudyUnitLabel}.\n\n${details}\n\nCrea una actividad completa para estudiar este recurso.`);
  }

  function renderWorkbookCard(kind: "grammar" | "vocabulary", workbook: Workbook | null) {
    if (!workbook) return null;
    const label = kind === "grammar" ? "gramática" : "vocabulario";
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100">
        <p className="font-semibold">Guía de {label} generada</p>
        <p className="mt-1 break-words text-xs text-slate-300">{workbook.title}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={workbook.exportUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-white/10 px-3 py-2 text-center text-xs font-semibold hover:bg-white/20">
            XLSX
          </a>
          <a href={workbook.fileUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-3 py-2 text-center text-xs font-semibold hover:bg-white/10">
            Sheets
          </a>
        </div>
      </div>
    );
  }

  if (!isLoaded && !E2E_DEMO) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-6 text-white">
        <p>Loading English OS...</p>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold">English OS Coach</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Sign in to continue your guided English learning path.</p>
          <SignInButton mode="modal">
            <button className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500">Sign in</button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,#1e3a8a_0,#020617_34%,#020617_100%)] text-white">
      <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-3 py-3 sm:px-4 lg:px-6 lg:py-5">
        <header className="hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">English OS</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">English OS Coach</h1>
              <p className="mt-1 text-sm text-slate-300">Profesor IA para clase guiada, práctica y evaluación.</p>
              <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">{email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 sm:inline-flex">Clase guiada</span>
              {!E2E_DEMO && <UserButton />}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Unidad actual</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{contextLoading ? "Loading..." : activeStudyUnitLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Clase de hoy</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{currentLesson || "Guided class"}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-amber-200/80">Progreso de clase</p>
              <p className="mt-1 truncate text-sm font-semibold text-amber-100">{PROGRESS_STATUS}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button type="button" onClick={startTodayClass} disabled={loading || !activeStudyUnit} className="rounded-2xl bg-blue-600 px-3 py-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">
              Empezar explicación
            </button>
            <button type="button" onClick={requestHint} disabled={loading || !activeStudyUnit} className="rounded-2xl border border-yellow-500/50 bg-yellow-500/10 px-3 py-3 text-xs font-bold text-yellow-100 hover:bg-yellow-500/20 disabled:opacity-50">
              Dame una pista
            </button>
            <button type="button" onClick={requestUnitGrammar} disabled={loading || !activeStudyUnit} className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-xs font-bold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">
              Gramática
            </button>
            <button type="button" onClick={requestUnitVocabulary} disabled={loading || !activeStudyUnit} className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-3 text-xs font-bold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50">
              Vocabulario
            </button>
          </div>
          {contextError && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{contextError}</div>}
        </header>

        {error && <div className="mb-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{error}</div>}

        <div className="grid flex-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="order-2 flex min-h-[70dvh] min-w-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl lg:h-[calc(100dvh-40px)]">
            <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-5 lg:p-6">
              {messages.map((message, index) => (
                <article key={index} className={message.role === "user" ? "ml-auto max-w-[92%] rounded-3xl bg-blue-600 p-4 shadow-lg sm:max-w-2xl" : "mr-auto max-w-[96%] rounded-3xl border border-white/10 bg-slate-900 p-4 text-slate-100 shadow-lg sm:max-w-4xl lg:p-5"}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className={message.role === "user" ? "text-[11px] font-semibold uppercase tracking-wide text-blue-100" : "text-[11px] font-semibold uppercase tracking-wide text-slate-500"}>{message.role === "user" ? "Tú" : "Profesor"}</p>
                  </div>
                  <div className={message.role === "user" ? "prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-7 text-white sm:text-base sm:leading-8" : "prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-7 text-slate-100 sm:text-base sm:leading-8"}>
                    <MarkdownMessage content={message.content} />
                  </div>
                </article>
              ))}
              {(loading || agentLoading) && <div className="mr-auto max-w-[92%] rounded-3xl bg-white p-4 text-sm text-slate-700">{agentLoading ? `${activeAgent.name} está pensando...` : "El profesor está pensando..."}</div>}
              <div ref={bottomRef} />
            </div>

            <footer className="sticky bottom-0 z-10 border-t border-white/10 bg-slate-950/95 p-3 backdrop-blur sm:p-4">
              <p className="mb-2 text-xs font-medium text-slate-300">Responde en inglés. Yo corregiré gramática, vocabulario y naturalidad.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={input}
                  disabled={!hydrated}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Escribe tu respuesta en inglés o pide una explicación..."
                  className="min-h-24 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 p-3 text-base text-white outline-none focus:border-blue-500"
                />
                <button onClick={() => sendMessage()} disabled={!hydrated || loading || !input.trim()} className="rounded-2xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-36">
                  {loading ? "..." : "Enviar respuesta"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Enter envía. Shift + Enter agrega línea. El avance se habilita solo después de aprobar la evaluación.</p>
            </footer>
          </section>

          <aside className="order-1 space-y-3 lg:h-[calc(100dvh-40px)] lg:overflow-y-auto">
            <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-300">Tu clase</p>
              <h2 className="mt-1 text-lg font-bold">{activeStudyUnitLabel}</h2>
              <p className="mt-1 text-sm text-slate-400">Material y práctica conectados con tu unidad actual.</p>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unidad de estudio</label>
              <input value={studyUnit} onChange={(event) => setStudyUnit(event.target.value)} placeholder={currentUnit || "Unit 1"} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setStudyUnit(currentUnit)} disabled={!currentUnit} className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50">
                  Usar actual
                </button>
                <button type="button" onClick={startTodayClass} disabled={loading || !activeStudyUnit} className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500 disabled:opacity-50">
                  Clase
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-300">Guías de estudio</p>
              <p className="mt-1 text-sm text-slate-400">Material descargable para {activeStudyUnitLabel}.</p>
              <div className="mt-3 grid gap-2">
                <button type="button" onClick={() => createWorkbook("grammar")} disabled={grammarWorkbookLoading || !activeStudyUnit || E2E_DEMO} className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                  {grammarWorkbookLoading ? "Generando..." : `Guía de gramática · ${activeStudyUnitLabel}`}
                </button>
                <button type="button" onClick={() => createWorkbook("vocabulary")} disabled={vocabularyWorkbookLoading || !activeStudyUnit || E2E_DEMO} className="rounded-2xl bg-cyan-600 px-3 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
                  {vocabularyWorkbookLoading ? "Generando..." : `Guía de vocabulario · ${activeStudyUnitLabel}`}
                </button>
                <button type="button" onClick={requestUnitGrammar} disabled={loading || !activeStudyUnit} className="rounded-2xl border border-emerald-700 px-3 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-950 disabled:opacity-50">
                  Explicar gramática en chat
                </button>
                <button type="button" onClick={requestUnitVocabulary} disabled={loading || !activeStudyUnit} className="rounded-2xl border border-cyan-700 px-3 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-950 disabled:opacity-50">
                  Explicar vocabulario en chat
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {grammarWorkbookError && <div className="rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{grammarWorkbookError}</div>}
                {vocabularyWorkbookError && <div className="rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{vocabularyWorkbookError}</div>}
                {renderWorkbookCard("grammar", grammarWorkbook)}
                {renderWorkbookCard("vocabulary", vocabularyWorkbook)}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-300">Ayudas rápidas</p>
              <p className="mt-1 text-sm text-slate-400">{activeAgent.description}</p>
              <select value={activeAgentId} onChange={(event) => setActiveAgentId(event.target.value as AgentId)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500">
                {SPECIALIST_AGENTS.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {SPECIALIST_AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setActiveAgentId(agent.id);
                      sendAgentMessage(agent.defaultPrompt);
                    }}
                    disabled={agentLoading}
                    className="rounded-2xl border border-slate-700 px-2 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {agent.shortName}
                  </button>
                ))}
              </div>
              {agentError && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">{agentError}</div>}
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
              <h3 className="text-sm font-bold text-slate-100">Materiales de clase</h3>
              <p className="mt-1 text-xs text-slate-400">Audios, videos y documentos para {activeStudyUnitLabel}.</p>
              {resourcesLoading && <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">Loading resources...</div>}
              {resourcesError && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{resourcesError}</div>}
              {!resourcesLoading && !resourcesError && resources.length === 0 && <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">No hay materiales cargados para esta unidad.</div>}
              <div className="mt-3 space-y-3">
                {resources.map((resource) => (
                  <div key={resource.resourceId} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{resource.title}</h3>
                      <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase text-slate-400">{resource.type}</span>
                    </div>
                    <p className="mb-3 text-xs leading-5 text-slate-400">{resource.description}</p>
                    {resource.type === "audio" && resource.embedUrl && <iframe src={resource.embedUrl} className="mb-3 h-20 w-full rounded-2xl border border-slate-800 bg-black" allow="autoplay" />}
                    {resource.type === "video" && resource.embedUrl && (
                      <div className="mb-3 aspect-video overflow-hidden rounded-2xl border border-slate-800 bg-black">
                        <iframe src={resource.embedUrl} title={resource.title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <a href={resource.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-700 px-3 py-2 text-center text-sm font-semibold hover:bg-slate-800">
                        Abrir
                      </a>
                      <button type="button" onClick={() => requestResourcePractice(resource)} disabled={loading} className="rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
                        Practicar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
