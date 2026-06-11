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

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const message = input.trim();

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

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <h1 className="text-2xl font-bold mb-4">English OS Coach</h1>
          <p className="text-slate-300 mb-6">
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
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 md:px-6">
        <header className="sticky top-0 z-20 mb-4 rounded-2xl border border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">
                English OS Coach
              </h1>
              <p className="text-sm text-slate-400">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                Last tokens:{" "}
                <span className="font-semibold text-white">
                  {lastTokens ?? "—"}
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                Last cost:{" "}
                <span className="font-semibold text-white">
                  {lastCost === null ? "—" : `$${lastCost.toFixed(6)}`}
                </span>
              </div>

              <Link
                href="/"
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900"
              >
                Dashboard
              </Link>

              <Link
                href="/users"
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900"
              >
                Users
              </Link>

              <UserButton />
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="flex-1 rounded-2xl border border-slate-800 bg-slate-900">
          <div className="min-h-[calc(100vh-280px)] space-y-6 p-4 md:p-8">
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
        </section>

        <footer className="sticky bottom-0 z-20 mt-4 rounded-2xl border border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
          <div className="flex flex-col gap-3">
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
              className="min-h-28 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-4 text-base text-white outline-none focus:border-blue-500"
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Enter sends. Shift + Enter creates a new line.
              </p>

              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send to Coach"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}