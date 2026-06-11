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

export default function CoachPage() {
  const { isLoaded, isSignedIn, user } = useUser();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "coach",
      content:
        "Hi Pedro. I’m your English OS Coach. Tell me what you want to practice today, or ask me what your next recommended activity is.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [lastTokens, setLastTokens] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [currentUnit, setCurrentUnit] = useState("");
  const [currentLesson, setCurrentLesson] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");

  const [resources, setResources] = useState<DriveUnitResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
        data.context?.missionControl ||
        data.missionControl ||
        data.context ||
        {};

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

      if (unit) {
        setCurrentUnit(unit);
      }

      if (lesson) {
        setCurrentLesson(lesson);
      }
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
      const params = new URLSearchParams({
        unit,
      });

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
        body: JSON.stringify({
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Coach request failed.");
      }

      const missionControl =
        data.context?.missionControl ||
        data.missionControl ||
        data.context ||
        {};

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

      if (unit) {
        setCurrentUnit(unit);
      }

      if (lesson) {
        setCurrentLesson(lesson);
      }

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
                Tokens:{" "}
                <span className="font-semibold text-white">
                  {lastTokens ?? "—"}
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                Cost:{" "}
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

              {loading && (
                <div className="mr-auto max-w-5xl rounded-2xl bg-slate-800 p-5 text-slate-300">
                  Coach is thinking...
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <footer className="border-t border-slate-800 bg-slate-950/80 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={requestUnitGrammar}
                  disabled={loading || !currentUnit}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                >
                  Agregar gramática de la unidad
                </button>

                <button
                  type="button"
                  onClick={requestUnitVocabulary}
                  disabled={loading || !currentUnit}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                >
                  Agregar vocabulario de la unidad
                </button>
              </div>

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
                  placeholder="Example: Help me practice giving advice in a business context."
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
                Enter sends. Shift + Enter creates a new line.
              </p>
            </footer>
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold">Unit Resources</h2>
              <p className="mt-1 text-sm text-slate-400">
                Audios and videos loaded from Google Drive.
              </p>
            </div>

            {resourcesLoading && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                Loading resources...
              </div>
            )}

            {resourcesError && (
              <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
                {resourcesError}
              </div>
            )}

            {!resourcesLoading && !resourcesError && resources.length === 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                No Drive resources found for this unit.
              </div>
            )}

            <div className="space-y-4">
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
          </aside>
        </div>
      </div>
    </main>
  );
}