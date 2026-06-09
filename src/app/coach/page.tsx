"use client";

import { useState } from "react";
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
  const [error, setError] = useState("");

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
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col p-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">English OS Coach</h1>
            <p className="text-sm text-slate-400">
              Signed in as {user?.primaryEmailAddress?.emailAddress}
            </p>
          </div>

          <div className="flex items-center gap-3">
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
        </header>

        <section className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase text-slate-500">Agent</p>
            <p className="font-semibold">Coach</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase text-slate-500">Mode</p>
            <p className="font-semibold">Text Pilot</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase text-slate-500">Last estimated cost</p>
            <p className="font-semibold">
              {lastCost === null ? "—" : `$${lastCost.toFixed(6)} USD`}
            </p>
          </div>
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="h-[60vh] space-y-4 overflow-y-auto p-5">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[80%] rounded-2xl bg-blue-600 p-4"
                    : "mr-auto max-w-[85%] rounded-2xl bg-slate-800 p-4"
                }
              >
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-300">
                  {message.role === "user" ? "You" : "Coach"}
                </p>

                <div className="whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </div>

                {message.usage && (
                  <div className="mt-3 rounded-xl bg-slate-950 p-3 text-xs text-slate-400">
                    <div>Model: {message.usage.model}</div>
                    <div>Total tokens: {message.usage.totalTokens}</div>
                    <div>
                      Estimated cost: $
                      {message.usage.estimatedCostUSD.toFixed(6)} USD
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="mr-auto max-w-[85%] rounded-2xl bg-slate-800 p-4 text-slate-300">
                Coach is thinking...
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 p-4">
            <div className="flex gap-3">
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
                className="min-h-24 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-blue-500"
              />

              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Enter sends. Shift + Enter creates a new line.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
