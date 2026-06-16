"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { MarkdownMessage } from "@/components/MarkdownMessage";

type Message = {
  role: "user" | "coach";
  content: string;
};

type AnalysisUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
};

function safeParseMessages(value: string | null): Message[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Message[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((message) => message && typeof message.content === "string")
      .map((message) => ({
        role: message.role === "user" ? "user" : "coach",
        content: message.content,
      }));
  } catch {
    return [];
  }
}

function buildPastedMessages(transcript: string): Message[] {
  const content = transcript.trim();
  if (!content) return [];

  return [
    {
      role: "user",
      content: `Analyze this pasted conversation transcript:\n\n${content}`,
    },
  ];
}

export default function ConversationAnalysisPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [storedMessages, setStoredMessages] = useState<Message[]>([]);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [focus, setFocus] = useState(
    "Analiza calidad pedagógica, errores recurrentes, riesgos de contrato de clase y mejoras UI/frontend."
  );
  const [analysis, setAnalysis] = useState("");
  const [responseId, setResponseId] = useState("");
  const [usage, setUsage] = useState<AnalysisUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const conversationStorageKey = user?.primaryEmailAddress?.emailAddress
    ? `english-os-coach:${user.primaryEmailAddress.emailAddress}`
    : "";

  const activeMessages = useMemo(() => {
    const pasted = buildPastedMessages(pastedTranscript);
    return pasted.length ? pasted : storedMessages;
  }, [pastedTranscript, storedMessages]);

  useEffect(() => {
    if (!conversationStorageKey) return;
    setStoredMessages(safeParseMessages(window.localStorage.getItem(conversationStorageKey)));
  }, [conversationStorageKey]);

  function reloadStoredConversation() {
    if (!conversationStorageKey) return;
    setStoredMessages(safeParseMessages(window.localStorage.getItem(conversationStorageKey)));
  }

  async function analyzeConversation(usePreviousResponse: boolean) {
    if (!activeMessages.length || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/english-os/conversation-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: activeMessages,
          focus,
          previousResponseId: usePreviousResponse ? responseId : "",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Conversation analysis failed.");
      }

      setAnalysis(data.reply || "No analysis returned.");
      setResponseId(data.responseId || "");
      setUsage(data.usage || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown analysis error");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-6 text-white">
        <p>Loading English OS...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <h1 className="text-2xl font-bold">Conversation Analysis</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Sign in to analyze your English OS coach conversation.
          </p>
          <SignInButton mode="modal">
            <button className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500">
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-white">
      <div className="mx-auto grid min-h-[100dvh] max-w-7xl gap-4 px-3 py-3 sm:px-4 lg:grid-cols-[390px_minmax(0,1fr)] lg:px-6 lg:py-5">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">
                  English OS
                </p>
                <h1 className="mt-1 text-2xl font-bold">Conversation Analysis</h1>
                <p className="mt-1 text-xs text-slate-400">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
              <UserButton />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/coach"
                className="rounded-2xl border border-slate-700 px-3 py-2 text-center text-sm font-semibold hover:bg-slate-800"
              >
                Coach
              </Link>
              <button
                type="button"
                onClick={reloadStoredConversation}
                className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800"
              >
                Reload chat
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Source</p>
            <h2 className="mt-1 text-lg font-bold">Frontend conversation</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              By default, this page reads the last saved Coach conversation from this browser. Paste a transcript below to analyze another conversation.
            </p>
            <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
              Stored turns: <strong className="text-white">{storedMessages.length}</strong>
              <br />
              Active turns: <strong className="text-white">{activeMessages.length}</strong>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Analysis focus
            </label>
            <textarea
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              className="mt-2 min-h-28 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Optional pasted transcript
            </label>
            <textarea
              value={pastedTranscript}
              onChange={(event) => setPastedTranscript(event.target.value)}
              placeholder="Paste this ChatGPT conversation, a coach transcript, or leave empty to use the saved Coach chat..."
              className="mt-2 min-h-40 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500"
            />

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => analyzeConversation(false)}
                disabled={loading || !activeMessages.length}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Analyzing..." : "Analyze conversation"}
              </button>
              <button
                type="button"
                onClick={() => analyzeConversation(true)}
                disabled={loading || !activeMessages.length || !responseId}
                className="rounded-2xl border border-purple-700 bg-purple-950/50 px-4 py-3 text-sm font-bold text-purple-100 hover:bg-purple-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue deeper analysis
              </button>
            </div>
          </section>
        </aside>

        <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-4">
            <h2 className="text-xl font-bold">Deep analysis</h2>
            <p className="mt-1 text-sm text-slate-400">
              The backend uses the OpenAI SDK and can continue from the previous analysis response.
            </p>
            {usage && (
              <p className="mt-2 text-xs text-slate-500">
                {usage.model} · {usage.totalTokens} tokens · ${usage.estimatedCostUSD.toFixed(6)}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {error && (
              <div className="mb-4 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
                {error}
              </div>
            )}

            {analysis ? (
              <article className="rounded-3xl bg-slate-800 p-4 shadow-lg lg:p-5">
                <MarkdownMessage content={analysis} />
              </article>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-6 text-sm leading-7 text-slate-400">
                Run an analysis to see learning signals, risks, UI improvements, and next actions.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
