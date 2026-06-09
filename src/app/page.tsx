"use client";

import { useEffect, useState } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";

type EnglishOSContext = {
  ok: boolean;
  user?: Record<string, unknown>;
  currentPosition?: {
    unit?: string;
    lesson?: string;
    source?: string;
  };
  recommendedCurrentPosition?: {
    unit?: string;
    lesson?: string;
    source?: string;
  };
  missionControl?: {
    found?: boolean;
    missionControl?: {
      name?: string;
      currentUnit?: string;
      currentLesson?: string;
      currentCEFR?: string;
      lastActivity?: string;
      lastGPTUsed?: string;
      lastSessionSummary?: string;
      topRecurringMistake?: string;
      currentFocus?: string;
      nextRecommendedAction?: string;
      status?: string;
    };
  };
  nextRecommendedAction?: {
    recommendation?: {
      priority?: string;
      recommendedSkill?: string;
      recommendedActivity?: string;
      recommendedPrompt?: string;
    };
    vocabularyToRecycle?: string[];
  };
  recentMistakes?: Record<string, unknown>[];
  activeVocabulary?: Record<string, unknown>[];
  recentProgress?: Record<string, unknown>[];
  error?: string;
};

export default function Home() {
  const { isLoaded, isSignedIn } = useUser();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [data, setData] = useState<EnglishOSContext | null>(null);
  const [message, setMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  async function loadCurrentUser() {
    setAuthLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/english-os/current-user", {
        cache: "no-store",
      });

      const result = await response.json();

      if (result.ok && result.authorized && result.email) {
        setAuthorized(true);
        setEmail(result.email);
        setData(result.englishOS);
      } else {
        setAuthorized(false);
        setMessage(result.error || "Access not authorized for this email.");
      }
    } catch (error) {
      setAuthorized(false);
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadCurrentUser();
    }

    if (isLoaded && !isSignedIn) {
      setAuthLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  async function loadContext() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/english-os/context?userEmail=${encodeURIComponent(email)}`
      );

      const result = await response.json();
      setData(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function createDocument(documentType: string, targetFolderKey: string) {
    setDocumentLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/english-os/document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userEmail: email,
          learnerId: email,
          documentType,
          targetFolderKey,
          sourceAgent: "English OS Dashboard",
          unit:
            data?.recommendedCurrentPosition?.unit ||
            data?.missionControl?.missionControl?.currentUnit ||
            "",
          lesson:
            data?.recommendedCurrentPosition?.lesson ||
            data?.missionControl?.missionControl?.currentLesson ||
            "",
          notes: `Generated from English OS Dashboard: ${documentType}`,
        }),
      });

      const result = await response.json();

      if (result.ok && result.document?.url) {
        setMessage(`Document created: ${result.document.url}`);
      } else {
        setMessage(result.error || "Document request completed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setDocumentLoading(false);
    }
  }

  const mission = data?.missionControl?.missionControl;
  const recommendation = data?.nextRecommendedAction?.recommendation;

  if (!isLoaded || authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          Loading English OS...
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">English OS Dashboard</h1>
          <p className="text-slate-400">
            Sign in with Google to access your learning dashboard.
          </p>

          <SignInButton mode="redirect">
            <button className="rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-red-950 border border-red-800 p-6 text-red-100 space-y-3">
          <div className="flex justify-end">
            <UserButton />
          </div>

          <h2 className="text-xl font-bold">Access not authorized</h2>

          <p>
            Your Google account is authenticated, but this email is not active in
            English OS Users.
          </p>

          {message && <p className="text-sm">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">English OS Dashboard</h1>
            <p className="text-slate-400">
              Operational dashboard for learner context, Mission Control, and
              next actions.
            </p>
          </div>

          <UserButton />
        </header>

        <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800">
          <label className="block text-sm text-slate-300 mb-2">
            Learner email
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 outline-none"
              value={email}
              readOnly
              placeholder="learner@example.com"
            />

            <button
              onClick={loadContext}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Reload context"}
            </button>
          </div>
        </section>

        {message && (
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-4 text-sm text-slate-200">
            {message.startsWith("Document created:") ? (
              <a
                href={message.replace("Document created: ", "")}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 underline"
              >
                {message}
              </a>
            ) : (
              message
            )}
          </div>
        )}

        {data?.error && (
          <div className="rounded-xl bg-red-950 border border-red-800 p-4 text-red-200">
            {data.error}
          </div>
        )}

        {data?.ok && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
              <h2 className="text-xl font-bold">Mission Control</h2>

              <Info label="Name" value={mission?.name} />
              <Info label="Current CEFR" value={mission?.currentCEFR} />
              <Info label="Status" value={mission?.status} />
              <Info label="Last GPT Used" value={mission?.lastGPTUsed} />
              <Info
                label="Last Activity"
                value={formatDate(String(mission?.lastActivity || ""))}
              />
            </section>

            <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3">
              <h2 className="text-xl font-bold">Current Position</h2>

              <Info
                label="Unit"
                value={
                  data.recommendedCurrentPosition?.unit ||
                  mission?.currentUnit
                }
              />

              <Info
                label="Lesson"
                value={
                  data.recommendedCurrentPosition?.lesson ||
                  mission?.currentLesson
                }
              />

              <Info
                label="Context Source"
                value={data.recommendedCurrentPosition?.source}
              />
            </section>

            <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-3 lg:col-span-2">
              <h2 className="text-xl font-bold">Next Recommended Action</h2>

              <Info label="Priority" value={recommendation?.priority} />
              <Info label="Skill" value={recommendation?.recommendedSkill} />
              <Info
                label="Activity"
                value={recommendation?.recommendedActivity}
              />

              <div className="rounded-xl bg-slate-800 p-4 text-slate-200">
                {recommendation?.recommendedPrompt ||
                  "No recommendation available."}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800">
              <h2 className="text-xl font-bold mb-3">Recent Mistakes</h2>

              <div className="space-y-3">
                {(data.recentMistakes || []).slice(0, 5).map((item, index) => (
                  <div key={index} className="rounded-xl bg-slate-800 p-4">
                    <p className="font-semibold">
                      {String(item["Mistake"] || "No mistake")}
                    </p>
                    <p className="text-sm text-slate-400">
                      {String(item["Correction"] || "")}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800">
              <h2 className="text-xl font-bold mb-3">Active Vocabulary</h2>

              <div className="space-y-3">
                {(data.activeVocabulary || [])
                  .slice(0, 8)
                  .map((item, index) => (
                    <div key={index} className="rounded-xl bg-slate-800 p-4">
                      <p className="font-semibold">
                        {String(item["Word/Chunk"] || "")}
                      </p>
                      <p className="text-sm text-slate-400">
                        {String(item["Meaning"] || "")}
                      </p>
                    </div>
                  ))}
              </div>
            </section>

            <section className="rounded-2xl bg-slate-900 p-5 border border-slate-800 lg:col-span-2 space-y-4">
              <h2 className="text-xl font-bold">Documents</h2>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  disabled={documentLoading}
                  onClick={() =>
                    createDocument("Daily Session Summary", "dailySessions")
                  }
                  className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-50"
                >
                  Generate Daily Summary
                </button>

                <button
                  disabled={documentLoading}
                  onClick={() =>
                    createDocument(
                      "Mission Control Snapshot",
                      "b2MissionControl"
                    )
                  }
                  className="rounded-xl bg-purple-600 px-5 py-3 font-semibold hover:bg-purple-500 disabled:opacity-50"
                >
                  Generate Mission Snapshot
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-100">{value || "—"}</p>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "—";
  return value.includes("T") ? value.split("T")[0] : value;
}