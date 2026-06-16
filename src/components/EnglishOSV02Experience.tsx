"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";

type Status = "approved" | "needs_work";
type ActiveView = "dashboard" | "class" | "mistakes" | "practice" | "summary";
type ComfortTheme = "dark" | "warm" | "blue" | "light";

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

type ClassSelector = {
  label: string;
  unit: number;
  localClass: number;
  globalClass: number;
  kind: "Student" | "Grammar+" | "Video";
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
  fullMarkdown?: string;
  message?: string;
};

type CoachMessage = {
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

const UNIT_4_CLASSES: ClassSelector[] = [
  { label: "Class 22", unit: 4, localClass: 1, globalClass: 22, kind: "Student" },
  { label: "Class 23", unit: 4, localClass: 2, globalClass: 23, kind: "Student" },
  { label: "Class 24", unit: 4, localClass: 3, globalClass: 24, kind: "Grammar+" },
  { label: "Class 25", unit: 4, localClass: 4, globalClass: 25, kind: "Student" },
  { label: "Class 26", unit: 4, localClass: 5, globalClass: 26, kind: "Student" },
  { label: "Class 27", unit: 4, localClass: 6, globalClass: 27, kind: "Grammar+" },
  { label: "Class 28", unit: 4, localClass: 7, globalClass: 28, kind: "Video" },
];

const THEME_OPTIONS: { id: ComfortTheme; label: string; description: string }[] = [
  { id: "dark", label: "Dark", description: "High contrast for short work." },
  { id: "warm", label: "Warm paper", description: "Comfortable for long reading." },
  { id: "blue", label: "Soft blue", description: "Soft study mode." },
  { id: "light", label: "Light", description: "Clean long-session view." },
];

function classFromCurrentClass(data: V02Data | null): ClassSelector {
  if (!data) return UNIT_4_CLASSES[6];
  return (
    UNIT_4_CLASSES.find((item) => item.globalClass === data.currentClass.globalClass) || {
      label: `Class ${data.currentClass.globalClass}`,
      unit: data.currentClass.unit,
      localClass: data.currentClass.localClass,
      globalClass: data.currentClass.globalClass,
      kind: data.currentClass.title.toLowerCase().includes("video") ? "Video" : "Student",
    }
  );
}

function getInitialTheme(): ComfortTheme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("english-os-comfort-theme") as ComfortTheme | null;
  return THEME_OPTIONS.some((option) => option.id === saved) ? saved || "dark" : "dark";
}

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

function buildQuickQuizPrompt() {
  return [
    "Hazme un quiz rápido de la Unidad 4 antes de empezar la clase.",
    "Dame 10 preguntas: 4 de grammar, 3 de vocabulary y 3 de speaking.",
    "Pregunta una por una, corrige mis respuestas y al final dime si estoy listo para continuar.",
    "No avances de clase ni apruebes práctica.",
  ].join("\n");
}

function buildTeachClassPrompt(classPack?: ClassPackSummary | null) {
  const packKey = classPack?.retrievalKey ? ` ${classPack.retrievalKey}` : "";
  return [
    `Usa el class pack${packKey} para enseñarme esta clase como profesor.`,
    "No avances progreso.",
    "Primero resume el objetivo y luego hazme la primera pregunta.",
  ].join(" ");
}

function compactStudentContent(content: string) {
  const cleaned = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !/^~+$/.test(line.trim()))
    .join("\n");

  return cleaned.length > 6000 ? `${cleaned.slice(0, 6000)}\n\n[Contenido recortado para lectura en pantalla.]` : cleaned;
}

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
  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [loading, setLoading] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [practicePrompt, setPracticePrompt] = useState(DEFAULT_PROMPT);
  const [answer, setAnswer] = useState("");
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [masteredMistakes, setMasteredMistakes] = useState<Record<string, boolean>>({});
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [theme, setTheme] = useState<ComfortTheme>("dark");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [classMaterialOpen, setClassMaterialOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassSelector>(UNIT_4_CLASSES[6]);
  const [classPack, setClassPack] = useState<ClassPackSummary | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState("");
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    {
      role: "coach",
      content:
        "Coach integrado listo. Puedes repasar una unidad, continuar la clase actual o hacer un quiz sin salir del dashboard.",
    },
  ]);
  const coachBottomRef = useRef<HTMLDivElement | null>(null);

  const currentTheme = useMemo(() => THEME_OPTIONS.find((option) => option.id === theme) || THEME_OPTIONS[0], [theme]);
  const coachApiPath = qaMode ? "/api/english-os/coach-qa" : "/api/english-os/coach";
  const coachStorageKey = `${qaMode ? "english-os-integrated-coach-qa" : "english-os-integrated-coach"}:${email}`;

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

      const nextData = { ...result, qaMode } as V02Data;
      setData(nextData);
      setSelectedClass(classFromCurrentClass(nextData));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

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
        headers: apiHeaders,
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.currentClassPack) throw new Error(result.error || "Class material could not be loaded.");
      setClassPack(result.currentClassPack);
    } catch (error) {
      setClassError(error instanceof Error ? error.message : "Unknown class material error");
    } finally {
      setClassLoading(false);
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

  async function sendCoachMessage(customMessage?: string) {
    const coachMessage = (customMessage || coachInput).trim();
    if (!coachMessage || coachLoading) return;

    const conversationHistory = coachMessages.slice(-12);
    setCoachInput("");
    setCoachError("");
    setCoachLoading(true);
    setCoachOpen(true);
    setCoachMessages((current) => [...current, { role: "user", content: coachMessage }]);

    try {
      const response = await fetch(coachApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        cache: "no-store",
        body: JSON.stringify({ message: coachMessage, conversationHistory }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Coach request failed.");
      setCoachMessages((current) => [
        ...current,
        { role: "coach", content: result.reply || "No response returned.", usage: result.usage },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown coach error";
      setCoachError(errorMessage);
      setCoachMessages((current) => [
        ...current,
        { role: "coach", content: `No pude completar la solicitud: ${errorMessage}` },
      ]);
    } finally {
      setCoachLoading(false);
    }
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

  function clearCoachConversation() {
    setCoachMessages([
      {
        role: "coach",
        content:
          "Conversación reiniciada. Puedes repasar una unidad, continuar la clase actual o hacer un quiz sin salir del dashboard.",
      },
    ]);
    setCoachInput("");
    setCoachError("");
  }

  useEffect(() => {
    if (email) loadV02();
  }, [email, apiPath]);

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.comfortTheme = theme;
    window.localStorage.setItem("english-os-comfort-theme", theme);
  }, [theme]);

  useEffect(() => {
    const saved = window.localStorage.getItem(coachStorageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as CoachMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) setCoachMessages(parsed);
    } catch {
      window.localStorage.removeItem(coachStorageKey);
    }
  }, [coachStorageKey]);

  useEffect(() => {
    coachBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    window.localStorage.setItem(coachStorageKey, JSON.stringify(coachMessages.slice(-40)));
  }, [coachMessages, coachLoading, coachStorageKey]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-5 md:p-8 space-y-6 pb-24">
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

          <div className="flex flex-wrap items-center gap-3">
            <ThemeSelector
              themeMenuOpen={themeMenuOpen}
              currentTheme={currentTheme}
              theme={theme}
              onToggle={() => setThemeMenuOpen((current) => !current)}
              onChange={(value) => {
                setTheme(value);
                setThemeMenuOpen(false);
              }}
            />
            <button
              onClick={() => setCoachOpen(true)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900"
            >
              Coach integrado
            </button>
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
              onClick={() => setActiveView(key as ActiveView)}
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

        {data && activeView === "class" && (
          <CurrentClassPlayer
            data={data}
            onPractice={() => setActiveView("practice")}
            onViewClass={() => loadClassMaterial(classFromCurrentClass(data))}
            onTeachClass={() => sendCoachMessage(buildTeachClassPrompt(classPack))}
            onReviewUnit={() => sendCoachMessage(buildUnit4ReviewPrompt())}
          />
        )}

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
            onViewClass={() => loadClassMaterial(classFromCurrentClass(data))}
            onReviewMistakes={() => setActiveView("mistakes")}
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

      {classMaterialOpen && (
        <ClassMaterialModal
          selectedClass={selectedClass}
          classPack={classPack}
          classLoading={classLoading}
          classError={classError}
          onLoadClass={loadClassMaterial}
          onClose={() => setClassMaterialOpen(false)}
          onTeach={() => {
            setClassMaterialOpen(false);
            sendCoachMessage(buildTeachClassPrompt(classPack));
          }}
        />
      )}

      {coachOpen && (
        <CoachDrawer
          qaMode={qaMode}
          messages={coachMessages}
          input={coachInput}
          loading={coachLoading}
          error={coachError}
          bottomRef={coachBottomRef}
          onInputChange={setCoachInput}
          onClose={() => setCoachOpen(false)}
          onSend={() => sendCoachMessage()}
          onClear={clearCoachConversation}
          onReviewUnit={() => sendCoachMessage(buildUnit4ReviewPrompt())}
          onQuiz={() => sendCoachMessage(buildQuickQuizPrompt())}
          onCurrentClass={() => sendCoachMessage(buildTeachClassPrompt(classPack))}
        />
      )}
    </main>
  );
}

function ThemeSelector({
  themeMenuOpen,
  currentTheme,
  theme,
  onToggle,
  onChange,
}: {
  themeMenuOpen: boolean;
  currentTheme: { id: ComfortTheme; label: string; description: string };
  theme: ComfortTheme;
  onToggle: () => void;
  onChange: (theme: ComfortTheme) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-900"
      >
        Tema: {currentTheme.label}
      </button>
      {themeMenuOpen && (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface)] p-3 text-[var(--comfort-text)] shadow-2xl shadow-black/30">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--comfort-muted)]">Fondo de lectura</p>
          <div className="mt-2 grid gap-2">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
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
    </div>
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

function CurrentClassPlayer({
  data,
  onPractice,
  onViewClass,
  onTeachClass,
  onReviewUnit,
}: {
  data: V02Data;
  onPractice: () => void;
  onViewClass: () => void;
  onTeachClass: () => void;
  onReviewUnit: () => void;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-sky-500/30 bg-slate-900 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Class Player</p>
            <h2 className="mt-1 text-2xl font-bold">Study this class before practicing</h2>
            <p className="mt-1 text-sm text-slate-400">The last QA run proved learners need the class material inside Current Class, not only in a floating tool.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onViewClass} className="rounded-xl bg-sky-400 px-4 py-3 font-bold text-slate-950 hover:bg-sky-300">
              Ver clase
            </button>
            <button onClick={onTeachClass} className="rounded-xl border border-slate-700 px-4 py-3 font-bold hover:bg-slate-800">
              Enseñar esta clase con Coach
            </button>
            <button onClick={onReviewUnit} className="rounded-xl border border-slate-700 px-4 py-3 font-bold hover:bg-slate-800">
              Repasar U4
            </button>
          </div>
        </div>
      </div>

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
              <p className="mt-3 text-sm text-slate-500">Use the “Ver clase” button above to inspect the exact class pack without leaving this UI.</p>
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

function ClassMaterialModal({
  selectedClass,
  classPack,
  classLoading,
  classError,
  onLoadClass,
  onClose,
  onTeach,
}: {
  selectedClass: ClassSelector;
  classPack: ClassPackSummary | null;
  classLoading: boolean;
  classError: string;
  onLoadClass: (target: ClassSelector) => void;
  onClose: () => void;
  onTeach: () => void;
}) {
  const isVideoClass = (classPack?.lessonType || selectedClass.kind).toLowerCase().includes("video");

  return (
    <section className="fixed inset-x-3 top-4 z-40 flex max-h-[82dvh] flex-col rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface)] text-[var(--comfort-text)] shadow-2xl shadow-black/40 lg:left-12 lg:right-12">
      <header className="border-b border-[var(--comfort-border)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--comfort-accent)]">Class material</p>
            <h2 className="mt-1 text-xl font-bold">{classPack?.title || `${selectedClass.label} — ${selectedClass.kind}`}</h2>
            <p className="mt-1 text-sm text-[var(--comfort-muted)]">
              {classPack?.lessonType || selectedClass.kind} · Book pages {classPack?.bookPages || "—"} · PDF pages {classPack?.pdfPages || "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {UNIT_4_CLASSES.map((item) => (
              <button
                key={item.globalClass}
                type="button"
                onClick={() => onLoadClass(item)}
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
            <button type="button" onClick={onClose} className="rounded-2xl border border-[var(--comfort-border)] px-3 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)]">
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
                    {classPack.specialMode || "This is a Video Class. Use the Drive video/resource when available and do not invent a transcript."}
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
                <h3 className="text-lg font-bold">How this behaves</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--comfort-muted)]">
                  Student Book classes show indexed book content. Video classes show the video-mode contract and discussion objectives when no transcript is indexed.
                </p>
              </div>

              <button
                type="button"
                onClick={onTeach}
                className="w-full rounded-2xl bg-[var(--comfort-accent)] px-4 py-3 text-sm font-bold text-[var(--comfort-accent-contrast)]"
              >
                Enseñar esta clase con Coach
              </button>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function CoachDrawer({
  qaMode,
  messages,
  input,
  loading,
  error,
  bottomRef,
  onInputChange,
  onClose,
  onSend,
  onClear,
  onReviewUnit,
  onQuiz,
  onCurrentClass,
}: {
  qaMode: boolean;
  messages: CoachMessage[];
  input: string;
  loading: boolean;
  error: string;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  onClear: () => void;
  onReviewUnit: () => void;
  onQuiz: () => void;
  onCurrentClass: () => void;
}) {
  return (
    <section className="fixed inset-x-3 bottom-4 z-40 flex max-h-[78dvh] flex-col rounded-3xl border border-[var(--comfort-border)] bg-[var(--comfort-surface)] text-[var(--comfort-text)] shadow-2xl shadow-black/40 sm:left-auto sm:right-4 sm:w-[480px]">
      <header className="border-b border-[var(--comfort-border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--comfort-accent)]">English OS</p>
            <h2 className="mt-1 text-lg font-bold">Coach integrado {qaMode ? "· QA" : ""}</h2>
            <p className="mt-1 text-xs text-[var(--comfort-muted)]">No sales del dashboard. No avanza progreso sin aprobación.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[var(--comfort-border)] px-3 py-1 text-sm hover:bg-[var(--comfort-surface-muted)]" aria-label="Cerrar Coach">
            ×
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={onReviewUnit} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-2 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
            Repasar U4
          </button>
          <button type="button" onClick={onQuiz} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-2 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
            Quiz U4
          </button>
          <button type="button" onClick={onCurrentClass} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-2 py-2 text-xs font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
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
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Escribe al Coach sin salir de esta UI..."
          className="min-h-20 w-full resize-none rounded-2xl border border-[var(--comfort-border)] bg-[var(--comfort-input)] p-3 text-sm text-[var(--comfort-text)] outline-none focus:border-[var(--comfort-accent)]"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onSend} disabled={loading || !input.trim()} className="flex-1 rounded-2xl bg-[var(--comfort-accent)] px-4 py-3 text-sm font-bold text-[var(--comfort-accent-contrast)] disabled:opacity-50">
            {loading ? "..." : "Enviar"}
          </button>
          <button type="button" onClick={onClear} disabled={loading} className="rounded-2xl border border-[var(--comfort-border)] px-4 py-3 text-sm font-bold hover:bg-[var(--comfort-surface-muted)] disabled:opacity-50">
            Limpiar
          </button>
        </div>
      </footer>
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
  onViewClass,
  onReviewMistakes,
}: {
  data: V02Data;
  prompt: string;
  answer: string;
  onPromptChange: (value: string) => void;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  onUseTestInput: (value: string) => void;
  onViewClass: () => void;
  onReviewMistakes: () => void;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Practice flow</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <StepCard number="1" title="View class" description="Open the material first, especially for Video Class mode." action="Ver clase" onAction={onViewClass} />
          <StepCard number="2" title="Recycle mistake" description="Use one issue from Mistake Inbox in this practice." action="Mistakes" onAction={onReviewMistakes} />
          <StepCard number="3" title="Write answer" description="Use advice + contrast + consequence." />
          <StepCard number="4" title="Analyze" description="Only approved answers can be submitted for approval." />
        </div>
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Adaptive Practice Generator</p>
            <h2 className="mt-2 text-3xl font-bold">Practice the current class plus one recurring mistake</h2>
            <p className="mt-2 text-slate-400">The analyzer uses the current class, recurring mistakes, active vocabulary, CEFR target, and business reasoning objective.</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Before you submit</p>
            <Checklist
              items={[
                "I opened or reviewed the class material.",
                "I used one advice structure.",
                "I added contrast with although or despite + noun phrase.",
                "I added a final strategic consequence sentence.",
              ]}
            />
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
          <Panel title="Current class pass requirements">
            <Checklist items={data.currentClass.requirementsToPass} />
          </Panel>
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
    </section>
  );
}

function StepCard({ number, title, description, action, onAction }: { number: string; title: string; description: string; action?: string; onAction?: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400 text-sm font-bold text-slate-950">{number}</span>
        <h3 className="font-bold text-slate-100">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} className="mt-3 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800">
          {action}
        </button>
      )}
    </div>
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

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--comfort-border)] bg-[var(--comfort-input)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--comfort-muted)]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--comfort-text)]">{value}</p>
    </div>
  );
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
