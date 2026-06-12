"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";

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
  description: string;
  defaultPrompt: string;
};

const SPECIALIST_AGENTS: SpecialistAgent[] = [
  {
    id: "grammar_corrector",
    name: "Grammar Corrector",
    description: "Corrige gramática, estructura, artículos, preposiciones y naturalidad.",
    defaultPrompt:
      "Please correct my English. Focus on grammar, sentence structure, articles, prepositions, fluency, and natural professional phrasing.",
  },
  {
    id: "speaking_partner",
    name: "Speaking Partner",
    description: "Practica conversación, fluidez y respuestas profesionales.",
    defaultPrompt:
      "Let's practice speaking in a business context. Ask me one realistic question and correct important mistakes after my answer.",
  },
  {
    id: "english_evaluator",
    name: "English Evaluator",
    description: "Evalúa nivel CEFR, precisión, fluidez, vocabulario y próximos pasos.",
    defaultPrompt:
      "Please evaluate my English objectively using CEFR criteria. Give me a score, weaknesses, recurring patterns, and targeted exercises.",
  },
];

function buildTodayClassMessage(unit: string, lesson: string) {
  const safeUnit = unit || "tu unidad actual";
  const safeLesson = lesson || "la clase de hoy";

  return [
    "Hola. Hoy no necesitas decidir qué practicar.",
    "",
    `Unidad actual: ${safeUnit}`,
    `Clase de hoy: ${safeLesson}`,
    "",
    "Vamos a seguir el hilo normal de English OS:",
    "1. Diagnóstico corto",
    "2. Vocabulario base",
    "3. Mini práctica guiada",
    "4. Corrección y siguiente paso",
    "",
    "Cuando estés listo, usa el botón Continuar clase de hoy en el panel de recursos o escribe: start",
  ].join("\n");
}

function buildStartTodayClassPrompt(unit: string, lesson: string) {
  return [
    "Start today's English OS class based on my current unit, current lesson, CEFR level, recent mistakes, vocabulary and next recommended action.",
    "Guide me step by step like a structured class.",
    "Start with a short diagnostic question, then continue with vocabulary and speaking practice.",
    `Current unit: ${unit || "current unit"}`,
    `Current lesson: ${lesson || "current lesson"}`,
  ].join("\n");
}

export default function CoachPage() {
  const { isLoaded, isSignedIn, user } = useUser();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "coach",
      content: "Loading your English OS class plan...",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [lastTokens, setLastTokens] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [agentError, setAgentError] = useState("");

  const [activeAgentId, setActiveAgentId] = useState<AgentId>("grammar_corrector");

  const [currentUnit, setCurrentUnit] = useState("");
  const [currentLesson, setCurrentLesson] = useState("");
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

  const activeAgent =
    SPECIALIST_AGENTS.find((agent) => agent.id === activeAgentId) ||
    SPECIALIST_AGENTS[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, agentLoading]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    loadUserContext();
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!currentUnit) return;
    loadDriveUnitResources(currentUnit);
  }, [currentUnit]);

  async function loadUserContext() {
    setContextLoading(true);
    setContextError("");

    try {
      const response = await fetch("/api/english-os/context", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to load English OS context.");
      }

      const missionControl =
        data.context?.missionControl || data.missionControl || data.context || {};

      const unit =
        missionControl.currentUnit ||
        missionControl.CurrentUnit ||
        missionControl.unit ||
        "";

      const lesson =
        missionControl.currentLesson ||
        missionControl.CurrentLesson ||
        missionControl.lesson ||
        "";

      if (unit) setCurrentUnit(unit);
      if (lesson) setCurrentLesson(lesson);

      setMessages((current) => {
        const shouldReplaceInitialMessage =
          current.length === 1 &&
          current[0]?.role === "coach" &&
          current[0]?.content.includes("Loading your English OS class plan");

        if (!shouldReplaceInitialMessage) return current;

        return [
          {
            role: "coach",
            content: buildTodayClassMessage(unit, lesson),
          },
        ];
      });
    } catch (err) {
      setContextError(
        err instanceof Error ? err.message : "Unknown context error"
      );
    } finally {
      setContextLoading(false);
    }
  }

  async function loadDriveUnitResources(unit: string) {
    if (!unit) return;

    setResourcesLoading(true);
    setResourcesError("");

    try {
      const params = new URLSearchParams({ unit });
      const response = await fetch(
        `/api/english-os/drive-unit-resources?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to load unit resources.");
      }

      setResources(data.resources || []);
    } catch (err) {
      setResourcesError(
        err instanceof Error ? err.message : "Unknown resources error"
      );
    } finally {
      setResourcesLoading(false);
    }
  }

  async function createWorkbook(kind: "grammar" | "vocabulary") {
    const isGrammar = kind === "grammar";

    if (!currentUnit) return;

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
      const params = new URLSearchParams({
        unit: currentUnit,
        lesson: currentLesson,
      });

      const endpoint = isGrammar
        ? "/api/english-os/grammar-workbook"
        : "/api/english-os/vocabulary-workbook";

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
            `Failed to create ${isGrammar ? "grammar" : "vocabulary"} workbook.`
        );
      }

      const workbook: Workbook = {
        title: data.title,
        fileUrl: data.fileUrl,
        exportUrl: data.exportUrl,
        generatedAt: data.generatedAt,
      };

      if (isGrammar) {
        setGrammarWorkbook(workbook);
      } else {
        setVocabularyWorkbook(workbook);
      }

      window.open(data.exportUrl || data.fileUrl, "_blank", "noopener,noreferrer");

      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content:
            `Listo. Generé el Excel de ${isGrammar ? "gramática" : "vocabulario"}. Puedes encontrarlo en el panel de recursos de la unidad.`,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown workbook error";

      if (isGrammar) {
        setGrammarWorkbookError(message);
      } else {
        setVocabularyWorkbookError(message);
      }

      setError(message);
    } finally {
      if (isGrammar) {
        setGrammarWorkbookLoading(false);
      } else {
        setVocabularyWorkbookLoading(false);
      }
    }
  }

  async function sendAgentMessage(customMessage?: string) {
    const message = (customMessage || input || activeAgent.defaultPrompt).trim();

    if (!message || agentLoading) return;

    setError("");
    setAgentError("");
    setInput("");
    setAgentLoading(true);

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: `[${activeAgent.name}] ${message}`,
      },
    ]);

    try {
      const response = await fetch("/api/english-os/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: activeAgent.id,
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Specialist agent request failed.");
      }

      setLastCost(data.usage?.estimatedCostUSD ?? null);
      setLastTokens(data.usage?.totalTokens ?? null);

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

    setError("");
    setInput("");
    setLoading(true);

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: message,
      },
    ]);

    try {
      const response = await fetch("/api/english-os/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Coach request failed.");
      }

      const missionControl =
        data.context?.missionControl || data.missionControl || data.context || {};

      const unit =
        missionControl.currentUnit ||
        missionControl.CurrentUnit ||
        missionControl.unit ||
        "";

      const lesson =
        missionControl.currentLesson ||
        missionControl.CurrentLesson ||
        missionControl.lesson ||
        "";

      if (unit) setCurrentUnit(unit);
      if (lesson) setCurrentLesson(lesson);

      setMessages((current) => {
        const shouldReplaceInitialMessage =
          current.length === 1 &&
          current[0]?.role === "coach" &&
          current[0]?.content.includes("Loading your English OS class plan");

        if (!shouldReplaceInitialMessage) return current;

        return [
          {
            role: "coach",
            content: buildTodayClassMessage(unit, lesson),
          },
        ];
      });

      setLastCost(data.usage?.estimatedCostUSD ?? null);
      setLastTokens(data.usage?.totalTokens ?? null);

      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: data.reply || "No response returned.",
          usage: data.usage,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function startTodayClass() {
    sendMessage(buildStartTodayClassPrompt(currentUnit, currentLesson));
  }

  function requestUnitGrammar() {
    sendMessage(
      "Agrega una guía completa de gramática de mi unidad actual según mi contexto de English OS. Incluye: estructuras gramaticales, reglas explicadas en español, ejemplos en inglés, errores frecuentes que cometo, tips B1/B2, mini-resumen ejecutivo y 10 ejercicios de práctica con respuestas."
    );
  }

  function requestUnitVocabulary() {
    sendMessage(
      "Agrega una guía completa de vocabulario de mi unidad actual según mi contexto de English OS. Incluye: palabras clave, phrasal verbs, collocations, significado en español, ejemplos en inglés, tips de pronunciación, errores comunes que cometo y 10 ejercicios de práctica con respuestas."
    );
  }

  function requestResourcePractice(resource: DriveUnitResource) {
    const details = [
      `Title: ${resource.title}`,
      `Type: ${resource.type}`,
      resource.section ? `Section: ${resource.section}` : "",
      resource.page ? `Page: ${resource.page}` : "",
      resource.exercise
        ? `Exercise: ${resource.exercise}${resource.exercisePart || ""}`
        : "",
      `URL: ${resource.url}`,
    ]
      .filter(Boolean)
      .join("\n");

    sendMessage(
      `Vamos a trabajar con este recurso de mi unidad actual.\n\n${details}\n\nCrea una actividad completa para estudiar este recurso. Incluye: preparación antes de escuchar/ver, vocabulario clave, preguntas de comprensión, práctica oral, errores comunes que debo evitar y una tarea final. Explícame en español y dame ejemplos en inglés.`
    );
  }

  function renderWorkbookCard(kind: "grammar" | "vocabulary", workbook: Workbook | null) {
    if (!workbook) return null;

    const label = kind === "grammar" ? "gramática" : "vocabulario";
    const colorClass =
      kind === "grammar"
        ? "border-emerald-800 bg-emerald-950/60 text-emerald-100"
        : "border-cyan-800 bg-cyan-950/60 text-cyan-100";
    const buttonClass =
      kind === "grammar"
        ? "bg-emerald-600 hover:bg-emerald-500"
        : "bg-cyan-600 hover:bg-cyan-500";
    const outlineClass =
      kind === "grammar"
        ? "border-emerald-700 hover:bg-emerald-900"
        : "border-cyan-700 hover:bg-cyan-900";

    return (
      <div className={`rounded-xl border p-3 text-sm ${colorClass}`}>
        <p className="font-semibold">Excel de {label} generado</p>
        <p className="mt-1 break-words text-xs opacity-90">{workbook.title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={workbook.exportUrl}
            target="_blank"
            rel="noreferrer"
            className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${buttonClass}`}
          >
            Descargar XLSX
          </a>
          <a
            href={workbook.fileUrl}
            target="_blank"
            rel="noreferrer"
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${outlineClass}`}
          >
            Abrir en Sheets
          </a>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="mb-4 text-2xl font-bold">English OS Coach</h1>
          <p className="mb-6 text-slate-300">
            Please sign in to use your English Coach.
          </p>
          <SignInButton mode="modal">
            <button className="rounded-xl bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500">
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 md:px-6">
        <header className="sticky top-0 z-20 mb-4 rounded-2xl border border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">
                English OS Coach
              </h1>
              <p className="text-sm text-slate-400">
                Signed in as {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                Tokens: {" "}
                <span className="font-semibold text-white">
                  {lastTokens ?? "—"}
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                Cost: {" "}
                <span className="font-semibold text-white">
                  {lastCost === null ? "—" : `$${lastCost.toFixed(6)}`}
                </span>
              </div>

              <Link
                href="/"
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900"
              >
                Dashboard
              </Link>

              <Link
                href="/users"
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900"
              >
                Users
              </Link>

              <UserButton />
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Current Unit
              </p>
              <p className="mt-1 font-semibold text-slate-100">
                {contextLoading
                  ? "Loading..."
                  : currentUnit || "No current unit found"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Current Lesson
              </p>
              <p className="mt-1 font-semibold text-slate-100">
                {contextLoading
                  ? "Loading..."
                  : currentLesson || "No current lesson found"}
              </p>
            </div>
          </div>

          {contextError && (
            <div className="mt-3 rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">
              {contextError}
            </div>
          )}
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]">
          <section className="flex min-h-[calc(100vh-280px)] flex-col rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8">
              {messages.map((message, index) => (
                <article
                  key={index}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-3xl rounded-2xl bg-blue-600 p-5 shadow-lg"
                      : "mr-auto max-w-5xl rounded-2xl bg-slate-800 p-5 shadow-lg"
                  }
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                      {message.role === "user" ? "You" : "Coach"}
                    </p>

                    {message.usage && (
                      <p className="text-xs text-slate-400">
                        {message.usage.totalTokens} tokens · $
                        {message.usage.estimatedCostUSD.toFixed(6)}
                      </p>
                    )}
                  </div>

                  <div className="prose prose-invert max-w-none whitespace-pre-wrap text-base leading-8 text-slate-100 md:text-lg">
                    {message.content}
                  </div>
                </article>
              ))}

              {(loading || agentLoading) && (
                <div className="mr-auto max-w-5xl rounded-2xl bg-slate-800 p-5 text-slate-300">
                  {agentLoading
                    ? `${activeAgent.name} is thinking...`
                    : "Coach is thinking..."}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <footer className="border-t border-slate-800 bg-slate-950/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Example: answer the diagnostic question from today's class."
                  className="min-h-28 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 p-4 text-base text-white outline-none focus:border-blue-500"
                />

                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-blue-600 px-8 py-4 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 md:w-36"
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                Enter sends with the general coach. Use Continuar clase de hoy when you want a guided class.
              </p>
            </footer>
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Unit Resources</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Materials, workbooks and specialist tools for this unit.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-blue-900 bg-blue-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-300">
                Today's Class
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {currentLesson || "Clase guiada de English OS"}
              </p>
              <p className="mt-2 text-xs leading-5 text-blue-100/80">
                El Coach guía la clase paso a paso. No tienes que decidir qué practicar.
              </p>
              <button
                type="button"
                onClick={startTodayClass}
                disabled={loading || !currentUnit}
                className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Continuar clase de hoy
              </button>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Unit Workbooks
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Genera archivos de estudio sin interrumpir la conversación.
              </p>

              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => createWorkbook("grammar")}
                  disabled={grammarWorkbookLoading || !currentUnit}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {grammarWorkbookLoading
                    ? "Generando gramática..."
                    : "Descargar Excel de gramática"}
                </button>

                <button
                  type="button"
                  onClick={() => createWorkbook("vocabulary")}
                  disabled={vocabularyWorkbookLoading || !currentUnit}
                  className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  {vocabularyWorkbookLoading
                    ? "Generando vocabulario..."
                    : "Descargar Excel de vocabulario"}
                </button>

                <button
                  type="button"
                  onClick={requestUnitGrammar}
                  disabled={loading || !currentUnit}
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                >
                  Agregar gramática al chat
                </button>

                <button
                  type="button"
                  onClick={requestUnitVocabulary}
                  disabled={loading || !currentUnit}
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                >
                  Agregar vocabulario al chat
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {grammarWorkbookError && (
                  <div className="rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">
                    {grammarWorkbookError}
                  </div>
                )}

                {vocabularyWorkbookError && (
                  <div className="rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">
                    {vocabularyWorkbookError}
                  </div>
                )}

                {renderWorkbookCard("grammar", grammarWorkbook)}
                {renderWorkbookCard("vocabulary", vocabularyWorkbook)}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex flex-col gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Specialist Agent
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {activeAgent.description}
                  </p>
                </div>

                <select
                  value={activeAgentId}
                  onChange={(event) => setActiveAgentId(event.target.value as AgentId)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                >
                  {SPECIALIST_AGENTS.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => sendAgentMessage()}
                  disabled={agentLoading}
                  className="rounded-xl bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {agentLoading ? "Running agent..." : "Usar agente"}
                </button>

                {SPECIALIST_AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => {
                      setActiveAgentId(agent.id);
                      sendAgentMessage(agent.defaultPrompt);
                    }}
                    disabled={agentLoading}
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {agent.name}
                  </button>
                ))}
              </div>

              {agentError && (
                <div className="mt-3 rounded-xl border border-red-800 bg-red-950 p-3 text-sm text-red-100">
                  {agentError}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <h3 className="text-sm font-bold text-slate-100">Drive Materials</h3>
              <p className="mt-1 text-xs text-slate-400">
                Audios and videos loaded from Google Drive.
              </p>

              {resourcesLoading && (
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  Loading resources...
                </div>
              )}

              {resourcesError && (
                <div className="mt-3 rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
                  {resourcesError}
                </div>
              )}

              {!resourcesLoading && !resourcesError && resources.length === 0 && (
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No Drive resources found for this unit.
                </div>
              )}

              <div className="mt-3 space-y-4">
                {resources.map((resource) => (
                  <div
                    key={resource.resourceId}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">
                        {resource.title}
                      </h3>

                      <span className="rounded-full border border-slate-700 px-2 py-1 text-xs uppercase text-slate-400">
                        {resource.type}
                      </span>
                    </div>

                    <p className="mb-3 text-xs text-slate-400">
                      {resource.description}
                    </p>

                    {resource.type === "audio" && resource.embedUrl && (
                      <iframe
                        src={resource.embedUrl}
                        className="mb-3 h-20 w-full rounded-xl border border-slate-800 bg-black"
                        allow="autoplay"
                      />
                    )}

                    {resource.type === "video" && resource.embedUrl && (
                      <div className="mb-3 aspect-video overflow-hidden rounded-xl border border-slate-800 bg-black">
                        <iframe
                          src={resource.embedUrl}
                          title={resource.title}
                          className="h-full w-full"
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800"
                      >
                        Open
                      </a>

                      <button
                        type="button"
                        onClick={() => requestResourcePractice(resource)}
                        disabled={loading}
                        className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                      >
                        Practice this
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
