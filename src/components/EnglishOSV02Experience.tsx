"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Status = "approved" | "needs_work";

type V02Data = {
  ok: boolean;
  version: string;
  learner: {
    name: string;
    email: string;
    learnerId: string;
    registeredLevel: string;
    recentEvidenceLevel: string;
  };
  mission: {
    todayFocus: string;
    currentPosition: string;
    mode: string;
    level: string;
    mainTarget: string;
    whyThisMatters: string;
    nextRecommendedAction: string;
  };
  currentClass: {
    unit: number;
    localClass: number;
    globalClass: number;
    label: string;
    title: string;
    lesson: string;
    status: string;
    mode: string;
    goal: string;
    keyLanguage: string[];
    resources: string[];
    requirementsToPass: string[];
    guardrail: string;
  };
  mistakes: Mistake[];
  activeVocabulary: string[];
  warnings?: string[];
  qaMode?: boolean;
};

type Mistake = {
  id: string;
  mistake: string;
  correction: string;
  rule: string;
  examples: string[];
  retryPrompt: string;
};

type PracticeEvaluation = {
  grammar: Status;
  vocabulary: Status;
  businessReasoning: Status;
  eligibleForApproval: boolean;
  detectedIssue: string;
  quickCorrection: string;
  detailedExplanation: string;
  retryPrompt: string;
  suggestedAnswer: string;
  sessionSummary: {
    improved: string[];
    stillNeedsWork: string[];
    nextAction: string;
  };
};

type PracticeResult = {
  ok: boolean;
  answer: string;
  evaluation: PracticeEvaluation;
  automaticSessionSummary: PracticeEvaluation["sessionSummary"];
  autoAdvance: boolean;
  advanceRule: string;
  qaMode?: boolean;
  mcpAnalysis?: {
    reply?: string;
    responseId?: string;
    usage?: Record<string, unknown>;
  };
  mcpAnalysisError?: string;
};

type SelfTestResult = {
  ok: boolean;
  version: string;
  tests: { id: string; passed: boolean; result: string }[];
};

const DEFAULT_PROMPT =
  "Give advice to a manager whose team is tired and behind schedule.\n\nUse:\n- The way I see it, you ought to...\n- Although...\n- It might not be a bad idea to...\n- This would help...";

const TEST_INPUTS = [
  {
    label: "Test 3: although vs despite",
    value: "Despite Bogotá has many job opportunities, I prefer Cali.",
  },
  {
    label: "Test 4: incomplete advice",
    value: "The way I see it, you ought to give the whole team some time off.",
  },
  {
    label: "Test 5: B2 acceptable",
    value:
      "The way I see it, you ought to give the whole team some time off. Although the deadline is important, it might not be a bad idea to restart the project with a clearer plan so everyone knows what to prioritize. This would help the team recover while keeping the project aligned with business priorities.",
  },
];

export function EnglishOSV02Experience({
  email,
  learnerName = "Pedro",
  apiPath = "/api/english-os/v02",
  apiHeaders = {},
  qaMode = false,
  userMenu,
}: {
  email: string;
  learnerName?: string;
  apiPath?: string;
  apiHeaders?: Record<string, string>;
  qaMode?: boolean;
  userMenu?: ReactNode;
}) {
  const [data, setData] = useState<V02Data | null>(null);
  const [activeView, setActiveView] = useState<"dashboard" | "class" | "mistakes" | "practice" | "summary">("dashboard");
  const [loading, setLoading] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [practicePrompt, setPracticePrompt] = useState(DEFAULT_PROMPT);
  const [answer, setAnswer] = useState("");
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [masteredMistakes, setMasteredMistakes] = useState<Record<string, boolean>>({});
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);
  const [approvalMessage, setApprovalMessage] = useState("");

  async function loadV02() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        cache: "no-store",
        body: JSON.stringify({ action: "bootstrap", userEmail: email, learnerId: email }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not load English OS v0.2.");

      setData({ ...result, qaMode });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function submitPractice() {
    setPracticeLoading(true);
    setMessage("");
    setApprovalMessage("");

    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        cache: "no-store",
        body: JSON.stringify({
          action: "analyze_practice",
          userEmail: email,
          answer,
          focus:
            "Evaluate B1 to B2 business advice with contrast, recurring mistakes, active vocabulary, CEFR evidence, and final strategic consequence.",
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not analyze practice.");

      setPracticeResult(result);
      setActiveView("summary");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPracticeLoading(false);
    }
  }

  async function approvePractice() {
    setApprovalMessage("");
    setMessage("");

    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        cache: "no-store",
        body: JSON.stringify({ action: "approve_practice", userEmail: email, confirm: true }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not approve practice.");

      setApprovalMessage(
        result.qaMode
          ? "QA approval simulated. No real learner progress was changed."
          : "Practice approved. The learner was not advanced automatically."
      );
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : "Unknown error");
    }
  }

  async function runSelfTest() {
    setMessage("");
    const separator = apiPath.includes("?") ? "&" : "?";
    const response = await fetch(`${apiPath}${separator}selfTest=1`, {
      cache: "no-store",
      headers: apiHeaders,
    });
    const result = await response.json();
    setSelfTest(result);
  }

  function saveSession() {
    if (!practiceResult) return;

    const saved = {
      createdAt: new Date().toISOString(),
      learnerEmail: email,
      class: data?.currentClass.label,
      result: practiceResult,
      qaMode,
    };

    const key = `${qaMode ? "english-os-v02-qa-session" : "english-os-v02-session"}:${email}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
    localStorage.setItem(key, JSON.stringify([saved, ...existing].slice(0, 20)));
    setApprovalMessage(qaMode ? "QA session saved locally." : "Session saved locally. You no longer need to type “log the session”.");
  }

  function practiceMistake(mistake: Mistake) {
    setPracticePrompt(mistake.retryPrompt);
    setAnswer(mistake.mistake);
    setActiveView("practice");
  }

  useEffect(() => {
    if (email) loadV02();
  }, [email, apiPath]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-5 md:p-8 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-sky-300">English OS v0.2</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-bold">Adaptive Learning UX</h1>
              {qaMode && <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">QA mode</span>}
            </div>
            <p className="mt-2 max-w-3xl text-slate-400">
              Mission control, current class player, mistake inbox, adaptive practice, and automatic session summary for B1→B2 progress.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadV02}
              disabled={loading}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Reload MCP context"}
            </button>
            {userMenu}
          </div>
        </header>

        {qaMode && (
          <Alert tone="warning">
            QA mode uses the same learner UI and flow, but write actions are simulated and do not change real progress.
          </Alert>
        )}

        {message && <Alert tone="danger">{message}</Alert>}

        {data?.warnings && data.warnings.length > 0 && (
          <Alert tone="warning">MCP warnings: {data.warnings.join(" | ")}. The v0.2 pedagogical fallback is active.</Alert>
        )}

        <nav className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["dashboard", "Mission Control"],
            ["class", "Current Class"],
            ["mistakes", "Mistake Inbox"],
            ["practice", "Practice"],
            ["summary", "Session Summary"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveView(key as typeof activeView)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold border ${
                activeView === key ? "border-sky-400 bg-sky-400 text-slate-950" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {!data && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-slate-300">{loading ? "Loading learner context from English OS..." : "No English OS v0.2 data loaded yet."}</p>
          </section>
        )}

        {data && activeView === "dashboard" && (
          <MissionControlDashboard
            data={data}
            learnerName={learnerName || data.learner.name}
            onContinue={() => setActiveView("class")}
            onPractice={() => setActiveView("practice")}
            onSelfTest={runSelfTest}
            selfTest={selfTest}
          />
        )}

        {data && activeView === "class" && <CurrentClassPlayer data={data} onPractice={() => setActiveView("practice")} />}

        {data && activeView === "mistakes" && (
          <MistakeInbox
            mistakes={data.mistakes}
            masteredMistakes={masteredMistakes}
            onPractice={practiceMistake}
            onMastered={(id) => setMasteredMistakes((current) => ({ ...current, [id]: true }))}
          />
        )}

        {data && activeView === "practice" && (
          <AdaptivePracticeGenerator
            data={data}
            prompt={practicePrompt}
            answer={answer}
            onPromptChange={setPracticePrompt}
            onAnswerChange={setAnswer}
            onSubmit={submitPractice}
            loading={practiceLoading}
            onUseTestInput={(value) => setAnswer(value)}
          />
        )}

        {data && activeView === "summary" && (
          <SessionSummary
            result={practiceResult}
            onSave={saveSession}
            onPracticeAgain={() => setActiveView("practice")}
            onContinueClass={() => setActiveView("class")}
            onReviewMistakes={() => setActiveView("mistakes")}
            onApprove={approvePractice}
            approvalMessage={approvalMessage}
          />
        )}
      </div>
    </main>
  );
}

function MissionControlDashboard({
  data,
  learnerName,
  onContinue,
  onPractice,
  onSelfTest,
  selfTest,
}: {
  data: V02Data;
  learnerName: string;
  onContinue: () => void;
  onPractice: () => void;
  onSelfTest: () => void;
  selfTest: SelfTestResult | null;
}) {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-sky-500/40 bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Mission Control Dashboard</p>
        <h2 className="mt-3 text-3xl font-bold">{learnerName}, today your focus is:</h2>
        <p className="mt-3 text-2xl text-sky-200">{data.mission.todayFocus}</p>
        <p className="mt-4 max-w-3xl text-slate-300">{data.mission.whyThisMatters}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button onClick={onContinue} className="rounded-xl bg-sky-400 px-5 py-3 font-bold text-slate-950 hover:bg-sky-300">
            Continue Current Class
          </button>
          <button onClick={onPractice} className="rounded-xl border border-slate-700 px-5 py-3 font-bold hover:bg-slate-900">
            Start Adaptive Practice
          </button>
          <button onClick={onSelfTest} className="rounded-xl border border-emerald-600/60 px-5 py-3 font-bold text-emerald-200 hover:bg-emerald-950">
            Run UX self-tests
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <DashboardCard title="Where am I?">
          <Info label="Current position" value={data.mission.currentPosition} />
          <Info label="Mode" value={data.mission.mode} />
          <Info label="Class status" value={data.currentClass.status} />
        </DashboardCard>
        <DashboardCard title="What should I practice?">
          <Info label="Main target" value={data.mission.mainTarget} />
          <Info label="Active skill" value="Business advice with contrast" />
        </DashboardCard>
        <DashboardCard title="What should I do now?">
          <p className="text-slate-200">{data.mission.nextRecommendedAction}</p>
        </DashboardCard>
        <DashboardCard title="Progress snapshot">
          <Info label="Registered level" value={data.learner.registeredLevel} />
          <Info label="Recent evidence" value={data.learner.recentEvidenceLevel} />
          <Info label="Last approved class" value="Unit 4 — Class 27" />
        </DashboardCard>
      </div>

      {selfTest && (
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold">UX self-test results</h3>
            <StatusBadge status={selfTest.ok ? "approved" : "needs_work"} label={selfTest.ok ? "All passed" : "Needs work"} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {selfTest.tests.map((test) => (
              <div key={test.id} className="rounded-2xl bg-slate-800 p-4">
                <StatusBadge status={test.passed ? "approved" : "needs_work"} label={test.passed ? "Pass" : "Fail"} />
                <p className="mt-3 text-sm text-slate-300">{test.result}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function CurrentClassPlayer({ data, onPractice }: { data: V02Data; onPractice: () => void }) {
  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_0.85fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge>Current class</Badge>
            <Badge>Review class</Badge>
            <Badge>Not completed by opening</Badge>
          </div>

          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">{data.currentClass.label}</p>
            <h2 className="mt-2 text-3xl font-bold">{data.currentClass.title}</h2>
            <p className="mt-2 text-slate-300">{data.currentClass.lesson}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Video / Audio / Material">
              <p className="text-slate-300">Use this class as an integrated review. Watch or read the available material, then produce a B2 business advice answer.</p>
              <p className="mt-3 text-sm text-slate-500">Open “Ver clase” to inspect the exact class pack without leaving this UI.</p>
            </Panel>
            <Panel title="Notes / Transcript">
              <p className="text-slate-300">Your answer must combine advice, contrast, prioritization, and consequence. This class is reviewing—not advancing automatically.</p>
            </Panel>
          </div>

          <Panel title="Practice Requirements">
            <Checklist items={data.currentClass.requirementsToPass} />
          </Panel>
        </div>

        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <Panel title="AI Coach Instructions">
            <p className="text-slate-300">First correct quickly. Then explain the rule. End with a retry prompt and automatic session summary.</p>
          </Panel>
          <Panel title="Key Language">
            <div className="flex flex-wrap gap-2">
              {data.currentClass.keyLanguage.map((item) => (
                <span key={item} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200">{item}</span>
              ))}
            </div>
          </Panel>
          <Panel title="Resources">
            <Checklist items={data.currentClass.resources} />
          </Panel>
          <Alert tone="warning">{data.currentClass.guardrail}</Alert>
          <button onClick={onPractice} className="w-full rounded-xl bg-sky-400 px-5 py-3 font-bold text-slate-950 hover:bg-sky-300">
            Practice this class
          </button>
        </aside>
      </div>
    </section>
  );
}

function MistakeInbox({
  mistakes,
  masteredMistakes,
  onPractice,
  onMastered,
}: {
  mistakes: Mistake[];
  masteredMistakes: Record<string, boolean>;
  onPractice: (mistake: Mistake) => void;
  onMastered: (id: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Mistake Inbox</p>
        <h2 className="mt-2 text-3xl font-bold">Recurring errors to recycle in every session</h2>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {mistakes.map((mistake) => (
          <MistakeCard
            key={mistake.id}
            mistake={mistake}
            mastered={Boolean(masteredMistakes[mistake.id])}
            onPractice={() => onPractice(mistake)}
            onMastered={() => onMastered(mistake.id)}
          />
        ))}
      </div>
    </section>
  );
}

function MistakeCard({ mistake, mastered, onPractice, onMastered }: { mistake: Mistake; mastered: boolean; onPractice: () => void; onMastered: () => void }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={mastered ? "approved" : "needs_work"} label={mastered ? "Mastered" : "Needs practice"} />
        <button onClick={onMastered} className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800">Mark as mastered</button>
      </div>
      <Info label="Incorrect version" value={mistake.mistake} />
      <Info label="Correction" value={mistake.correction} />
      <Info label="Grammar rule" value={mistake.rule} />
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Examples</p>
        <ul className="mt-2 space-y-2 text-slate-300">
          {mistake.examples.map((example) => <li key={example} className="rounded-xl bg-slate-900 p-3">{example}</li>)}
        </ul>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={onPractice} className="rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300">Practice</button>
        <button onClick={onPractice} className="rounded-xl border border-slate-700 px-4 py-2 font-semibold hover:bg-slate-900">Speaking retry</button>
      </div>
    </article>
  );
}

function AdaptivePracticeGenerator({
  data,
  prompt,
  answer,
  onPromptChange,
  onAnswerChange,
  onSubmit,
  loading,
  onUseTestInput,
}: {
  data: V02Data;
  prompt: string;
  answer: string;
  onPromptChange: (value: string) => void;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  onUseTestInput: (value: string) => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.85fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Adaptive Practice Generator</p>
          <h2 className="mt-2 text-3xl font-bold">Practice the current class plus one recurring mistake</h2>
          <p className="mt-2 text-slate-400">The analyzer uses the current class, recurring mistakes, active vocabulary, CEFR target, and business reasoning objective.</p>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500">Practice prompt</label>
          <textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} className="mt-2 min-h-36 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-100 outline-none focus:border-sky-400" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500">Write or paste your answer</label>
          <textarea value={answer} onChange={(event) => onAnswerChange(event.target.value)} placeholder="The way I see it, you ought to..." className="mt-2 min-h-44 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-100 outline-none focus:border-sky-400" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button disabled={loading || !answer.trim()} onClick={onSubmit} className="rounded-xl bg-sky-400 px-5 py-3 font-bold text-slate-950 hover:bg-sky-300 disabled:opacity-50">
            {loading ? "Analyzing with MCP..." : "Analyze practice"}
          </button>
          <button onClick={() => onAnswerChange("")} className="rounded-xl border border-slate-700 px-5 py-3 font-bold hover:bg-slate-900">Clear</button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {TEST_INPUTS.map((item) => (
            <button key={item.label} onClick={() => onUseTestInput(item.value)} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-sm text-slate-300 hover:border-sky-500">{item.label}</button>
          ))}
        </div>
      </div>
      <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <Panel title="Active vocabulary to recycle">
          <div className="flex flex-wrap gap-2">
            {data.activeVocabulary.map((item) => <span key={item} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200">{item}</span>)}
          </div>
        </Panel>
        <Panel title="Approval rule">
          <p className="text-slate-300">Grammar, vocabulary, and business reasoning must be approved. Opening content or submitting a weak answer never advances the learner.</p>
        </Panel>
        <Panel title="B2 expected answer">
          <p className="text-sm leading-6 text-slate-300">The way I see it, you ought to give the whole team some time off. Although the deadline is important, it might not be a bad idea to restart the project with a clearer plan so everyone knows what to prioritize. This would help the team recover while keeping the project aligned with business priorities.</p>
        </Panel>
      </aside>
    </section>
  );
}

function SessionSummary({
  result,
  onSave,
  onPracticeAgain,
  onContinueClass,
  onReviewMistakes,
  onApprove,
  approvalMessage,
}: {
  result: PracticeResult | null;
  onSave: () => void;
  onPracticeAgain: () => void;
  onContinueClass: () => void;
  onReviewMistakes: () => void;
  onApprove: () => void;
  approvalMessage: string;
}) {
  if (!result) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Automatic Session Summary</h2>
        <p className="mt-3 text-slate-400">Complete one adaptive practice to generate a summary automatically.</p>
      </section>
    );
  }

  const evaluation = result.evaluation;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">AI Feedback</p>
            <h2 className="mt-2 text-3xl font-bold">{evaluation.detectedIssue}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={evaluation.grammar} label={`Grammar: ${evaluation.grammar}`} />
            <StatusBadge status={evaluation.vocabulary} label={`Vocabulary: ${evaluation.vocabulary}`} />
            <StatusBadge status={evaluation.businessReasoning} label={`Business reasoning: ${evaluation.businessReasoning}`} />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Quick correction"><p className="text-slate-100">{evaluation.quickCorrection}</p></Panel>
          <Panel title="Detailed explanation"><p className="text-slate-300">{evaluation.detailedExplanation}</p></Panel>
        </div>
        <Panel title="Retry prompt"><p className="text-slate-300">{evaluation.retryPrompt}</p></Panel>
        {result.mcpAnalysis?.reply && <Panel title="MCP conversation analysis"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{result.mcpAnalysis.reply}</p></Panel>}
        {result.mcpAnalysisError && <Alert tone="warning">MCP analysis warning: {result.mcpAnalysisError}</Alert>}
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">Automatic Session Summary + Log</p>
            <h2 className="mt-2 text-3xl font-bold">No need to type “log the session”</h2>
          </div>
          <StatusBadge status={evaluation.eligibleForApproval ? "approved" : "needs_work"} label={evaluation.eligibleForApproval ? "Eligible for approval" : "Keep reviewing"} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryList title="Today you improved" items={evaluation.sessionSummary.improved} />
          <SummaryList title="Still needs work" items={evaluation.sessionSummary.stillNeedsWork} />
          <Panel title="Next action"><p className="text-slate-300">{evaluation.sessionSummary.nextAction}</p></Panel>
        </div>
        <Alert tone="warning">{result.advanceRule}</Alert>
        <div className="grid gap-3 md:grid-cols-5">
          <button onClick={onSave} className="rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950 hover:bg-emerald-300">Save Session</button>
          <button onClick={onPracticeAgain} className="rounded-xl border border-slate-700 px-4 py-3 font-bold hover:bg-slate-900">Practice Again</button>
          <button onClick={onContinueClass} className="rounded-xl border border-slate-700 px-4 py-3 font-bold hover:bg-slate-900">Continue Current Class</button>
          <button onClick={onReviewMistakes} className="rounded-xl border border-slate-700 px-4 py-3 font-bold hover:bg-slate-900">Review Mistakes</button>
          <button onClick={onApprove} disabled={!evaluation.eligibleForApproval} className="rounded-xl bg-sky-400 px-4 py-3 font-bold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40">Approve Practice</button>
        </div>
        {approvalMessage && <Alert tone={approvalMessage.includes("approved") || approvalMessage.includes("simulated") ? "success" : "warning"}>{approvalMessage}</Alert>}
      </div>
    </section>
  );
}

function DashboardCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 space-y-3"><h3 className="text-lg font-bold">{title}</h3>{children}</section>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><h3 className="font-bold text-slate-100">{title}</h3><div className="mt-3">{children}</div></div>;
}

function Info({ label, value }: { label: string; value?: string }) {
  return <div><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-slate-100">{value || "—"}</p></div>;
}

function Checklist({ items }: { items: string[] }) {
  return <ul className="space-y-2 text-slate-300">{items.map((item) => <li key={item} className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-sky-400" /><span>{item}</span></li>)}</ul>;
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return <Panel title={title}><Checklist items={items} /></Panel>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sm font-semibold text-sky-200">{children}</span>;
}

function StatusBadge({ status, label }: { status: Status; label: string }) {
  const className = status === "approved" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${className}`}>{label}</span>;
}

function Alert({ children, tone }: { children: ReactNode; tone: "success" | "warning" | "danger" }) {
  const className = tone === "success" ? "border-emerald-500/40 bg-emerald-950 text-emerald-100" : tone === "warning" ? "border-amber-500/40 bg-amber-950 text-amber-100" : "border-red-500/40 bg-red-950 text-red-100";
  return <div className={`rounded-2xl border p-4 text-sm ${className}`}>{children}</div>;
}
