"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { CoachIcon } from "@/components/CoachIcon";
import { CoachComposer } from "@/modules/coach-chat/CoachComposer";
import { CoachMessageList } from "@/modules/coach-chat/CoachMessageList";
import { CoachTopBar } from "@/modules/coach-layout/CoachTopBar";
import { CoachClassMaterialsPanel } from "@/modules/coach-resources/CoachClassMaterialsPanel";
import { CoachGuidesPanel } from "@/modules/coach-resources/CoachGuidesPanel";
import { CoachLearningPulsePanel } from "@/modules/coach-resources/CoachLearningPulsePanel";
import { CoachQuickHelpPanel } from "@/modules/coach-resources/CoachQuickHelpPanel";
import { CoachStudyPanel } from "@/modules/coach-resources/CoachStudyPanel";
import { toCoachAgentClientContracts } from "@/modules/coach-integrations/agentsContract";
import { renderClientPrompt, type ClientPromptId } from "@/modules/coach-prompts/clientPromptRegistry";
import { createCoachSessionContract } from "@/modules/coach-session/contract";
import type { CoachSessionState } from "@/modules/coach-session/types";
import {
  toCoachClassMaterialsPanelModel,
  toCoachGuidesPanelModel,
  toCoachLearningPulsePanelModel,
  toCoachQuickHelpPanelModel,
  toCoachStudyPanelModel,
  toCoachTopBarModel,
} from "@/modules/coach-session/viewModels";

type Message = {
  role: "user" | "coach";
  content: string;
  image?: {
    dataUrl: string;
    name?: string;
  };
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: number;
  };
};

type DriveUnitResource = {
  id: string;
  title: string;
  description: string;
  type: "audio" | "video" | "document" | "link";
  unitNumber: number | null;
  unitCode: string;
  section?: string;
  page?: string;
  exercise?: string;
  exercisePart?: string;
  url: string;
  embedUrl: string;
  provider: string;
  order?: number;
};

type Workbook = {
  kind: "grammar" | "vocabulary";
  title: string;
  fileId: string;
  fileUrl: string;
  exportUrl: string;
  unit: string;
  lesson: string;
  generatedAt?: string;
};

type AgentId = "grammar_corrector" | "speaking_partner" | "english_evaluator";
type CoachTheme = "slate" | "paper" | "sage" | "sand" | "blue";
type CoachTextSize = "compact" | "normal" | "large";
type StudyMode = "current" | "class" | "review" | "guide";

type LearningPulse = {
  level: string;
  practiceCount: number;
  evidenceCount: number | null;
  evidenceTotal: number;
  focus: string;
  nextStep: string;
};

type SpecialistAgent = {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  defaultPromptId: ClientPromptId;
};

const E2E_DEMO = process.env.NEXT_PUBLIC_E2E_DEMO === "1";
const DEMO_UNIT = "Unit 1";
const DEMO_LESSON = "Business advice speaking practice";
const FALLBACK_UNIT = "Unit 1";
const PROGRESS_STATUS = "Evaluación pendiente";
const COACH_TEXT_SIZE_ORDER: CoachTextSize[] = ["compact", "normal", "large"];

const SPECIALIST_AGENTS: SpecialistAgent[] = [
  {
    id: "grammar_corrector",
    name: "Corrector de gramática",
    shortName: "Gramática",
    description: "Corrige estructura, artículos, preposiciones y naturalidad.",
    defaultPromptId: "agents.grammarCorrector.default",
  },
  {
    id: "speaking_partner",
    name: "Compañero de speaking",
    shortName: "Speaking",
    description: "Practica conversación, fluidez y respuestas profesionales.",
    defaultPromptId: "agents.speakingPartner.default",
  },
  {
    id: "english_evaluator",
    name: "Evaluador B1/B2",
    shortName: "Evaluar",
    description: "Evalúa CEFR, precisión, vocabulario y próximos pasos.",
    defaultPromptId: "agents.englishEvaluator.default",
  },
];

const SPECIALIST_AGENT_CONTRACTS = toCoachAgentClientContracts(SPECIALIST_AGENTS);

function getLearnerDisplayName(user: ReturnType<typeof useUser>["user"]) {
  const candidate = user?.firstName || user?.fullName || user?.username || "";
  return String(candidate).trim();
}

function extractUnitNumber(value: string) {
  const match = String(value || "").match(/(\d{1,2})/);
  return match?.[1] || "";
}

function unitLabel(value: string) {
  const number = extractUnitNumber(value);
  return number ? `Unit ${number}` : value || "Current unit";
}

function normalizeUnitValue(value: string) {
  return unitLabel(value);
}

function buildTodayClassMessage(unit: string, lesson: string, learnerName = "") {
  return buildInitialCoachMessage(unit, lesson, "", learnerName);
}

function buildInitialCoachMessage(unit: string, lesson: string, progressSnapshot = "", learnerName = "") {
  const greeting = learnerName
    ? `Hola, ${learnerName}. Soy tu profesor de English OS y hoy vamos a trabajar paso a paso.`
    : "Hola. Soy tu profesor de English OS y hoy vamos a trabajar paso a paso.";
  return [
    greeting,
    "",
    `Unidad activa: ${unitLabel(unit)}.`,
    "",
    `Clase / lección actual: ${lesson || "Clase guiada de English OS"}.`,
    progressSnapshot ? `Avance: ${progressSnapshot}.` : "",
    "",
    "Puedes empezar la explicación, pedir una pista, practicar gramática o responder la evaluación pendiente. Yo mantengo el avance bloqueado hasta que la evaluación quede aprobada.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

async function buildStartTodayClassPrompt(unit: string, lesson: string) {
  const unitNumber = extractUnitNumber(unit);
  return renderClientPrompt("coach.startCurrentClass", {
    startRequest: unitNumber
      ? `Empecemos la clase actual de la unidad ${unitNumber}. Usa el contrato real de English OS; si no hay número de clase activo confiable, no inventes Class 1 y pide confirmación breve.`
      : "Empecemos mi clase actual. Usa el contrato real de English OS; si no hay número de clase activo confiable, no inventes Class 1 y pide confirmación breve.",
    lessonContext: lesson ? `Contexto guardado de lección o foco: ${lesson}` : "",
  });
}

async function buildHintPrompt(unit: string, lesson: string) {
  return renderClientPrompt("coach.hint", {
    unit: unitLabel(unit),
    lessonContext: lesson ? `Clase: ${lesson}` : "",
  });
}

async function buildUnitGrammarPrompt(unit: string) {
  const number = extractUnitNumber(unit);
  return renderClientPrompt("coach.unitGrammarGuide", {
    requestLine: number ? `Dame una guía de gramática de la unidad ${number}.` : "Dame una guía de gramática de mi unidad actual.",
  });
}

async function buildUnitVocabularyPrompt(unit: string) {
  const number = extractUnitNumber(unit);
  return renderClientPrompt("coach.unitVocabularyGuide", {
    requestLine: number ? `Dame una guía de vocabulario de la unidad ${number}.` : "Dame una guía de vocabulario de mi unidad actual.",
  });
}

function initialCoachMessages(): Message[] {
  return [
    {
      role: "coach",
      content: E2E_DEMO ? buildTodayClassMessage(DEMO_UNIT, DEMO_LESSON, "Pedro") : "Loading your English OS class plan...",
    },
  ];
}

function isReviewRequest(value: string) {
  return /\b(repas(?:o|ar|emos)|review|reinforcement|checkpoint)\b/i.test(value);
}

function isGuideRequest(value: string) {
  return /\b(gu[ií]a|guide)\b/i.test(value) && /\b(gram[aá]tica|grammar|vocabulario|vocabulary)\b/i.test(value);
}

function studyModeLabel(mode: StudyMode) {
  if (mode === "review") return "Repaso";
  if (mode === "guide") return "Guía";
  if (mode === "class") return "Clase";
  return "Actual";
}

function coachModeFromStudyMode(mode: StudyMode): CoachSessionState["mode"] {
  if (mode === "review" || mode === "guide" || mode === "class") return mode;
  return "current";
}

function inferCoordinatesFromReply(reply: string) {
  const text = String(reply || "");
  const unit = Number(text.match(/\bUnit\s+(\d{1,2})\b/i)?.[1] || 0) || null;
  const classNumber = Number(
    text.match(/\bClass\s*(?::|#|-|\s)\s*(\d{1,2})\b/i)?.[1] || 0,
  ) || null;
  return { unit, classNumber };
}

function nextCoachTextSize(current: CoachTextSize, direction: -1 | 1) {
  const currentIndex = COACH_TEXT_SIZE_ORDER.indexOf(current);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), COACH_TEXT_SIZE_ORDER.length - 1);
  return COACH_TEXT_SIZE_ORDER[nextIndex] || "normal";
}

function stripEphemeralImages(messages: Message[]) {
  return messages.map((message) => (message.image ? { ...message, image: undefined } : message));
}
function plainTextFromMarkdown(content: string) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestEnglishSpeechVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferredName = /(natural|neural|online|premium|jenny|aria|guy|samantha|google|microsoft|apple)/i;
  const englishVoices = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ""));
  const candidates = englishVoices.length ? englishVoices : voices;
  return candidates
    .map((voice) => {
      const langScore = /^en-US/i.test(voice.lang) ? 4 : /^en-GB/i.test(voice.lang) ? 3 : /^en/i.test(voice.lang) ? 2 : 0;
      const nameScore = preferredName.test(voice.name) ? 4 : 0;
      const localScore = voice.localService ? 1 : 0;
      return { voice, score: langScore + nameScore + localScore };
    })
    .sort((a, b) => b.score - a.score)[0]?.voice || null;
}

function getSavedPosition(data: any) {
  const context = data?.context || {};
  const user = context?.user || data?.user || {};
  const recommended = context?.recommendedCurrentPosition || data?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || data?.currentPosition || {};
  const missionControl = context?.missionControl || data?.missionControl || context || {};
  const sources = [
    {
      unit: recommended.unit || recommended.currentUnit,
      lesson: recommended.lesson || recommended.currentLesson,
    },
    {
      unit: current.unit || current.currentUnit,
      lesson: current.lesson || current.currentLesson,
    },
    {
      unit: user["Current Unit"] || user.CurrentUnit || user.unit || user.currentUnit,
      lesson: user["Current Lesson"] || user.CurrentLesson || user.lesson || user.currentLesson,
    },
    {
      unit: missionControl.currentUnit || missionControl.CurrentUnit || missionControl.unit,
      lesson: missionControl.currentLesson || missionControl.CurrentLesson || missionControl.lesson,
    },
  ];
  const pairedSource = sources.find((source) => String(source.unit || "").trim());
  if (pairedSource) {
    return {
      unit: String(pairedSource.unit || "").trim(),
      lesson: String(pairedSource.lesson || "").trim(),
    };
  }

  return {
    unit: "",
    lesson: String(sources.find((source) => String(source.lesson || "").trim())?.lesson || "").trim(),
  };
}

function readableProgressValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(readableProgressValue).find(Boolean) || "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "summary",
      "text",
      "label",
      "value",
      "name",
      "title",
      "focus",
      "weakness",
      "mistake",
      "correction",
      "nextAction",
      "recommendedAction",
      "action",
      "description",
      "cefrEstimate",
      "score",
      "status",
    ];
    for (const key of preferredKeys) {
      const readable = readableProgressValue(record[key]);
      if (readable) return readable;
    }
  }
  return "";
}

function firstProgressValue(...values: unknown[]) {
  return values.map(readableProgressValue).find(Boolean) || "";
}

function buildProgressSnapshot(data: any) {
  const context = data?.context || data || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || data?.missionControl || {};
  const user = context?.user || data?.user || {};
  const recentLogs = Array.isArray(context?.recentDailyLogs) ? context.recentDailyLogs : Array.isArray(data?.recentDailyLogs) ? data.recentDailyLogs : [];
  const recentMistakes = Array.isArray(context?.recentMistakes) ? context.recentMistakes : Array.isArray(data?.recentMistakes) ? data.recentMistakes : [];
  const recentProgress = Array.isArray(context?.recentProgress) ? context.recentProgress : Array.isArray(data?.recentProgress) ? data.recentProgress : [];

  const cefr = firstProgressValue(user["Current CEFR"], context.currentCEFR, missionControl.currentCEFR, missionControl.cefr);
  const lastEvaluation = firstProgressValue(missionControl.lastEvaluation, missionControl.lastEvaluationScore, context.lastEvaluation, recentProgress[0]?.cefrEstimate);
  const topMistake = firstProgressValue(missionControl.topMistake, context.topMistake, recentMistakes[0]?.mistake);

  const parts = [
    cefr ? `nivel actual ${cefr}` : "",
    lastEvaluation ? `última evidencia: ${lastEvaluation}` : "",
    recentLogs.length ? `${recentLogs.length} prácticas recientes` : "",
    topMistake ? `foco: ${topMistake}` : "",
  ].filter(Boolean);

  return parts.length ? parts.slice(0, 3).join(" · ") : "sin evaluaciones recientes disponibles";
}

function buildLearningPulse(data: any): LearningPulse {
  const context = data?.context || data || {};
  const missionControl = context?.missionControl?.missionControl || context?.missionControl || data?.missionControl || {};
  const user = context?.user || data?.user || {};
  const recentLogs = Array.isArray(context?.recentDailyLogs) ? context.recentDailyLogs : Array.isArray(data?.recentDailyLogs) ? data.recentDailyLogs : [];
  const recentMistakes = Array.isArray(context?.recentMistakes) ? context.recentMistakes : Array.isArray(data?.recentMistakes) ? data.recentMistakes : [];
  const recentProgress = Array.isArray(context?.recentProgress) ? context.recentProgress : Array.isArray(data?.recentProgress) ? data.recentProgress : [];
  const activeVocabulary = Array.isArray(context?.activeVocabulary) ? context.activeVocabulary : Array.isArray(data?.activeVocabulary) ? data.activeVocabulary : [];

  const level = firstProgressValue(user["Current CEFR"], context.currentCEFR, missionControl.currentCEFR, missionControl.cefr, recentProgress[0]?.cefrEstimate);
  const lastEvaluation = firstProgressValue(missionControl.lastEvaluation, missionControl.lastEvaluationScore, context.lastEvaluation, recentProgress[0]?.cefrEstimate);
  const topMistake = firstProgressValue(missionControl.topMistake, context.topMistake, recentMistakes[0]?.mistake);
  const nextAction = firstProgressValue(missionControl.nextAction, context.nextRecommendedAction, context.nextAction, recentLogs[0]?.nextAction);

  const evidenceFlags = [
    Boolean(lastEvaluation),
    recentLogs.length > 0,
    recentProgress.length > 0,
    activeVocabulary.length > 0 || recentMistakes.length > 0,
  ];
  const evidenceCount = evidenceFlags.some(Boolean) ? evidenceFlags.filter(Boolean).length : null;

  return {
    level: level || "Sin nivel confirmado",
    practiceCount: recentLogs.length,
    evidenceCount,
    evidenceTotal: 4,
    focus: topMistake || nextAction || "responder con más evidencia",
    nextStep: nextAction || "producir una respuesta breve y corregible",
  };
}

function learningPulseDetail(pulse: LearningPulse) {
  return pulse.evidenceCount === null ? "sin evidencias" : `${pulse.evidenceCount}/${pulse.evidenceTotal}`;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`El servidor no devolvió contenido (${response.status || "sin estado"}). Intenta nuevamente.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`El servidor devolvió una respuesta inválida (${response.status}). Intenta nuevamente.`);
  }
}

export default function CoachPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const authReady = isLoaded || authTimedOut || E2E_DEMO;
  const signedIn = isSignedIn || E2E_DEMO || authTimedOut;
  const email = user?.primaryEmailAddress?.emailAddress || (E2E_DEMO ? "demo@english-os.local" : "");
  const learnerName = getLearnerDisplayName(user) || (E2E_DEMO ? "Pedro" : "");

  const [messages, setMessages] = useState<Message[]>(initialCoachMessages);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<{ dataUrl: string; name?: string; mimeType?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [error, setError] = useState("");
  const [agentError, setAgentError] = useState("");
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("grammar_corrector");
  const [currentUnit, setCurrentUnit] = useState(E2E_DEMO ? DEMO_UNIT : "");
  const [currentLesson, setCurrentLesson] = useState(E2E_DEMO ? DEMO_LESSON : "");
  const [studyUnit, setStudyUnit] = useState(E2E_DEMO ? DEMO_UNIT : "");
  const [studyMode, setStudyMode] = useState<StudyMode>("current");
  const [studyClassNumber, setStudyClassNumber] = useState<number | null>(null);
  const [coachSession, setCoachSession] = useState<CoachSessionState>(() =>
    createCoachSessionContract({
      mode: "current",
      savedUnit: E2E_DEMO ? DEMO_UNIT : null,
      savedLesson: E2E_DEMO ? DEMO_LESSON : null,
      activeUnit: E2E_DEMO ? DEMO_UNIT : null,
      lessonTitle: E2E_DEMO ? DEMO_LESSON : null,
      resourcesUnit: E2E_DEMO ? DEMO_UNIT : null,
      source: E2E_DEMO ? "fallback" : "english_os",
    }),
  );
  const [learningPulse, setLearningPulse] = useState<LearningPulse>(() => buildLearningPulse({}));
  const [theme, setTheme] = useState<CoachTheme>("paper");
  const [textSize, setTextSize] = useState<CoachTextSize>("compact");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "like" | "dislike">>({});
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [resources, setResources] = useState<DriveUnitResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState("");
  const [resourcesNotice, setResourcesNotice] = useState("");
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(null);
  const [grammarWorkbook, setGrammarWorkbook] = useState<Workbook | null>(null);
  const [grammarWorkbookLoading, setGrammarWorkbookLoading] = useState(false);
  const [grammarWorkbookError, setGrammarWorkbookError] = useState("");
  const [vocabularyWorkbook, setVocabularyWorkbook] = useState<Workbook | null>(null);
  const [vocabularyWorkbookLoading, setVocabularyWorkbookLoading] = useState(false);
  const [vocabularyWorkbookError, setVocabularyWorkbookError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const coachAbortRef = useRef<AbortController | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);

  const activeAgent = SPECIALIST_AGENT_CONTRACTS.find((agent) => agent.id === activeAgentId) || SPECIALIST_AGENT_CONTRACTS[0];
  const activeAgentMetadata = SPECIALIST_AGENTS.find((agent) => agent.id === activeAgentId) || SPECIALIST_AGENTS[0];
  const uiSession = createCoachSessionContract({
    mode: coachModeFromStudyMode(studyMode),
    savedUnit: currentUnit || coachSession.savedUnit,
    savedLesson: currentLesson || coachSession.savedLesson,
    activeUnit: studyUnit || coachSession.activeUnit || currentUnit,
    activeClassNumber: studyClassNumber || coachSession.activeClassNumber,
    lessonTitle: coachSession.lessonTitle || currentLesson,
    resourcesUnit: coachSession.resourcesUnit || studyUnit || currentUnit,
    source: coachSession.source,
  });
  const activeStudyUnit = uiSession.resourcesUnit || uiSession.activeUnit || currentUnit;
  const activeStudyUnitLabel = unitLabel(activeStudyUnit);
  const activeLocationLabel = [activeStudyUnitLabel, studyClassNumber ? `Class ${studyClassNumber}` : ""].filter(Boolean).join(" · ");
  const learningPulseLabel = learningPulseDetail(learningPulse);
  const topBarModel = toCoachTopBarModel(uiSession, learningPulseLabel);
  const studyPanelModel = toCoachStudyPanelModel({
    session: uiSession,
    currentUnitLabel: unitLabel(currentUnit),
    contextLoading,
    studyUnitValue: studyUnit,
    loading,
  });
  const learningPulsePanelModel = toCoachLearningPulsePanelModel({
    level: learningPulse.level,
    evidenceLabel: learningPulseLabel,
    practiceCount: learningPulse.practiceCount,
    focus: learningPulse.focus,
    nextStep: learningPulse.nextStep,
  });
  const guidesPanelModel = toCoachGuidesPanelModel({
    unitLabel: activeStudyUnitLabel,
    canUseWorkbookActions: Boolean(activeStudyUnit) && !E2E_DEMO,
    chatActionsDisabled: loading || !activeStudyUnit,
    grammarWorkbookLoading,
    vocabularyWorkbookLoading,
    grammarWorkbookError,
    vocabularyWorkbookError,
    grammarWorkbook,
    vocabularyWorkbook,
  });
  const quickHelpPanelModel = toCoachQuickHelpPanelModel({
    agents: SPECIALIST_AGENT_CONTRACTS,
    activeAgentId,
    activeAgentDescription: activeAgent.description,
    loading: agentLoading,
    error: agentError,
  });
  const classMaterialsPanelModel = toCoachClassMaterialsPanelModel({
    unitLabel: activeStudyUnitLabel,
    resources,
    resourcesLoading,
    resourcesNotice,
    resourcesError,
    expandedResourceId,
    practiceDisabled: loading,
  });
  const chatMessageItems = messages.map((message) => ({
    role: message.role,
    content: message.content,
    image: message.image ? { dataUrl: message.image.dataUrl, name: message.image.name } : undefined,
  }));
  const composerImage = selectedImage ? { dataUrl: selectedImage.dataUrl, name: selectedImage.name } : null;
  const conversationStorageKey = email ? `english-os-coach:${email}` : "";

  useEffect(() => {
    setHydrated(true);
    const storedTheme = window.localStorage.getItem("english-os-coach-theme") as CoachTheme | null;
    const storedTextSize = window.localStorage.getItem("english-os-coach-text-size") as CoachTextSize | null;
    const storedSidebar = window.localStorage.getItem("english-os-coach-sidebar");
    if (storedTheme && ["slate", "paper", "sage", "sand", "blue"].includes(storedTheme)) setTheme(storedTheme);
    if (storedTextSize && COACH_TEXT_SIZE_ORDER.includes(storedTextSize)) setTextSize(storedTextSize);
    if (storedSidebar === "closed") {
      setSidebarOpen(false);
    } else if (storedSidebar === "open") {
      setSidebarOpen(true);
    } else if (window.matchMedia("(max-width: 640px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded || E2E_DEMO) return;
    const timer = window.setTimeout(() => setAuthTimedOut(true), 3500);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("english-os-coach-theme", theme);
    window.localStorage.setItem("english-os-coach-text-size", textSize);
    window.localStorage.setItem("english-os-coach-sidebar", sidebarOpen ? "open" : "closed");
  }, [hydrated, theme, textSize, sidebarOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (conversationStorageKey && messages.length > 0 && !E2E_DEMO) {
      window.localStorage.setItem(conversationStorageKey, JSON.stringify(stripEphemeralImages(messages.slice(-40))));
    }
  }, [messages, loading, agentLoading, conversationStorageKey]);

  useEffect(() => {
    if (E2E_DEMO) return;
    if (!authReady || !signedIn) return;

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
  }, [authReady, signedIn, conversationStorageKey, learnerName]);

  useEffect(() => {
    if (!activeStudyUnit || E2E_DEMO) return;
    loadDriveUnitResources(activeStudyUnit);
  }, [activeStudyUnit]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [input]);

  async function prepareImageForVocabulary(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
    const sourceDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No pude leer la imagen."));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No pude preparar la imagen."));
      img.src = sourceDataUrl;
    });

    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pude procesar la imagen.");
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { dataUrl, name: file.name, mimeType: "image/jpeg" };
  }

  async function handleImageSelected(file?: File) {
    if (!file) return;
    setError("");
    try {
      setSelectedImage(await prepareImageForVocabulary(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cargar la imagen.");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function loadUserContext() {
    setContextLoading(true);
    setContextError("");
    try {
      const response = await fetch("/api/english-os/context", { method: "GET", cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to load English OS context.");

      const { unit, lesson } = getSavedPosition(data);
      const resolvedUnit = unit ? normalizeUnitValue(unit) : "";
      const progressSnapshot = buildProgressSnapshot(data);
      setCoachSession(createCoachSessionContract({
        mode: "current",
        savedUnit: resolvedUnit || null,
        savedLesson: lesson || null,
        activeUnit: resolvedUnit || null,
        lessonTitle: lesson || null,
        resourcesUnit: resolvedUnit || null,
        source: "english_os",
      }));

      if (resolvedUnit) {
        setCurrentUnit(resolvedUnit);
        setStudyUnit((current) => current || resolvedUnit);
      }
      if (lesson) setCurrentLesson(lesson);
      setLearningPulse(buildLearningPulse(data));

      setMessages((current) => {
        const shouldReplace = current.length === 1 && current[0]?.content.includes("Loading your English OS class plan");
        return shouldReplace ? [{ role: "coach", content: buildInitialCoachMessage(resolvedUnit || "tu posición actual", lesson, progressSnapshot, learnerName) }] : current;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown context error";
      setContextError(message);
      setCurrentUnit((current) => current || "");
      setStudyUnit((current) => current || "");
      setMessages((current) => {
        const shouldReplace = current.length === 1 && current[0]?.content.includes("Loading your English OS class plan");
        if (!shouldReplace) return current;
        return [
          {
            role: "coach",
            content:
              "No pude cargar tu English plan todavía, pero no voy a dejar la clase bloqueada.\n\nPuedes pedir una clase, un repaso o practicar una unidad. Cuando la conexión con English OS vuelva a responder, recuperaré tu posición guardada automáticamente.",
          },
        ];
      });
    } finally {
      setContextLoading(false);
    }
  }

  async function loadDriveUnitResources(unit: string) {
    setResourcesLoading(true);
    setResourcesError("");
    setResourcesNotice("");
    try {
      const params = new URLSearchParams({ unit });
      const response = await fetch(`/api/english-os/drive-unit-resources?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to load unit resources.");
      setResources(Array.isArray(data.resources) ? data.resources : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown resources error";
      if (/Missing English OS environment variables/i.test(message)) {
        setResourcesNotice(
          "Los materiales conectados no están configurados en este entorno local. Para cargarlos aquí hacen falta ENGLISH_OS_BASE_URL y ENGLISH_OS_TOKEN en .env.local."
        );
        setResources([]);
      } else {
        setResourcesError(message);
      }
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
      const params = new URLSearchParams({ unit, lesson: studyMode === "current" ? currentLesson : "" });
      const endpoint = isGrammar ? "/api/english-os/grammar-workbook" : "/api/english-os/vocabulary-workbook";
      const response = await fetch(`${endpoint}?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.ok) throw new Error(data.error || `Failed to create ${kind} workbook.`);

      const workbook = data.workbook as Workbook | undefined;
      if (!workbook?.fileUrl && !workbook?.exportUrl) {
        throw new Error(`Invalid ${kind} workbook contract.`);
      }

      if (isGrammar) setGrammarWorkbook(workbook);
      else setVocabularyWorkbook(workbook);

      window.open(workbook.exportUrl || workbook.fileUrl, "_blank", "noopener,noreferrer");
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: [
            `Listo. Generé la guía de ${isGrammar ? "gramática" : "vocabulario"} para ${unitLabel(unit)}.`,
            "",
            workbook.exportUrl ? `- [Descargar XLSX](${workbook.exportUrl})` : "",
            workbook.fileUrl ? `- [Abrir en Sheets](${workbook.fileUrl})` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
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

  async function sendAgentMessage(customMessage?: string, agentIdOverride: AgentId = activeAgentId) {
    const targetAgent = SPECIALIST_AGENT_CONTRACTS.find((agent) => agent.id === agentIdOverride) || activeAgent;
    const targetAgentMetadata = SPECIALIST_AGENTS.find((agent) => agent.id === agentIdOverride) || activeAgentMetadata;
    const defaultPrompt = customMessage || input ? "" : await renderClientPrompt(targetAgentMetadata.defaultPromptId);
    const message = (customMessage || input || defaultPrompt).trim();
    if (!message || agentLoading) return;

    if (E2E_DEMO) {
      setMessages((current) => [
        ...current,
        { role: "user", content: `[${targetAgent.name}] ${message}` },
        { role: "coach", content: `${targetAgent.name}\n\nModo demo: aquí aparecería la retroalimentación especializada.` },
      ]);
      return;
    }

    setError("");
    setAgentError("");
    setInput("");
    setAgentLoading(true);
    setMessages((current) => [...current, { role: "user", content: `[${targetAgent.name}] ${message}` }]);
    const controller = new AbortController();
    agentAbortRef.current = controller;

    try {
      const response = await fetch("/api/english-os/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ agentId: targetAgent.id, message }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "Specialist agent request failed.");
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: `${data.agent?.name || targetAgent.name}\n\n${data.reply || "No response returned."}`,
          usage: data.usage,
        },
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unknown agent error";
      setAgentError(message);
      setError(message);
    } finally {
      if (agentAbortRef.current === controller) agentAbortRef.current = null;
      setAgentLoading(false);
    }
  }

  async function sendMessage(customMessage?: string) {
    const imageToAnalyze = customMessage ? null : selectedImage;
    const message = (customMessage || input || (imageToAnalyze ? "Analiza esta foto y ayúdame a aprender vocabulario en inglés." : "")).trim();
    if ((!message && !imageToAnalyze) || loading) return;

    if (E2E_DEMO) {
      setInput("");
      setSelectedImage(null);
      setMessages((current) => [
        ...current,
        { role: "user", content: message, image: imageToAnalyze ? { dataUrl: imageToAnalyze.dataUrl, name: imageToAnalyze.name } : undefined },
        { role: "coach", content: "Modo demo: el profesor respondería aquí usando el contexto real de la clase." },
      ]);
      return;
    }

    setError("");
    setInput("");
    setSelectedImage(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: message, image: imageToAnalyze ? { dataUrl: imageToAnalyze.dataUrl, name: imageToAnalyze.name } : undefined }]);
    const controller = new AbortController();
    coachAbortRef.current = controller;

    try {
      const response = await fetch("/api/english-os/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          conversationHistory: stripEphemeralImages(messages.slice(-12)),
          image: imageToAnalyze ? { dataUrl: imageToAnalyze.dataUrl, mimeType: imageToAnalyze.mimeType, name: imageToAnalyze.name } : undefined,
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "Coach request failed.");

      const savedPosition = getSavedPosition(data);
      const reply = data.reply || "No response returned.";
      const inferredCoordinates = inferCoordinatesFromReply(reply);
      const activeUnit = data.activeUnit || inferredCoordinates.unit;
      const activeClass = data.activeClass || inferredCoordinates.classNumber;
      const unit = activeUnit ? `Unit ${activeUnit}` : "";
      const lesson = savedPosition.lesson;
      const nextMode: StudyMode = isReviewRequest(message) ? "review" : isGuideRequest(message) ? "guide" : "class";
      const nextSession = data.session
        ? data.session as CoachSessionState
        : createCoachSessionContract({
          mode: coachModeFromStudyMode(nextMode),
          savedUnit: savedPosition.unit || currentUnit,
          savedLesson: lesson || currentLesson,
          activeUnit: unit || currentUnit,
          activeClassNumber: activeClass,
          lessonTitle: lesson || currentLesson,
          resourcesUnit: unit || currentUnit,
          source: "english_os",
        });

      setStudyMode(nextMode);
      setCoachSession(nextSession);
      if (nextSession.activeUnit || unit) {
        setStudyUnit(normalizeUnitValue(nextSession.activeUnit || unit));
      }
      setStudyClassNumber(nextSession.activeClassNumber && nextMode === "class" ? Number(nextSession.activeClassNumber) : null);
      if (nextSession.lessonTitle || lesson) setCurrentLesson(nextSession.lessonTitle || lesson);

      setMessages((current) => [
        ...current,
        { role: "coach", content: reply, usage: data.usage },
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          content: `No pude completar la respuesta esta vez. Puedes volver a enviarla.\n\nDetalle: ${errorMessage}`,
        },
      ]);
    } finally {
      if (coachAbortRef.current === controller) coachAbortRef.current = null;
      setLoading(false);
    }
  }

  function stopThinking() {
    coachAbortRef.current?.abort();
    agentAbortRef.current?.abort();
    coachAbortRef.current = null;
    agentAbortRef.current = null;
    setLoading(false);
    setAgentLoading(false);
  }

  async function startTodayClass() {
    sendMessage(await buildStartTodayClassPrompt(activeStudyUnit, studyMode === "current" ? currentLesson : ""));
  }

  async function requestUnitGrammar() {
    sendMessage(await buildUnitGrammarPrompt(activeStudyUnit));
  }

  async function requestUnitVocabulary() {
    sendMessage(await buildUnitVocabularyPrompt(activeStudyUnit));
  }

  async function requestHint() {
    sendMessage(await buildHintPrompt(activeStudyUnit, studyMode === "current" ? currentLesson : ""));
  }

  function requestResourcePractice(resourceId: string) {
    const resource = resources.find((item) => item.id === resourceId);
    if (!resource) return;
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

  async function copyMessage(content: string, index: number) {
    const text = String(content || "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiedMessageIndex(index);
    window.setTimeout(() => setCopiedMessageIndex(null), 1200);
  }

  function reportMessage(content: string, index: number) {
    const messageText = String(content || "").trim();
    const subject = `English OS error report · ${activeLocationLabel || "Coach"}`;
    const body = [
      "Hola, quiero reportar un posible error en esta respuesta de English OS.",
      "",
      `Fecha: ${new Date().toISOString()}`,
      `Learner: ${email}`,
      `Modo: ${studyModeLabel(studyMode)}`,
      `Objetivo activo: ${activeLocationLabel || "No definido"}`,
      typeof window !== "undefined" ? `URL: ${window.location.href}` : "",
      `Mensaje #: ${index + 1}`,
      "",
      "Texto reportado:",
      "----------------",
      messageText,
    ]
      .filter(Boolean)
      .join("\n");
    const mailto = `mailto:info@citizen-life.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 6000))}`;
    window.location.href = mailto;
  }

  function toggleMessageFeedback(index: number, value: "like" | "dislike") {
    setMessageFeedback((current) => {
      const next = { ...current };
      if (next[index] === value) delete next[index];
      else next[index] = value;
      return next;
    });
  }

  function speakMessage(content: string, index: number) {
    if (!("speechSynthesis" in window)) {
      setError("Tu navegador no soporta lectura en voz alta.");
      return;
    }

    const text = plainTextFromMarkdown(content);
    if (!text) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.voice = bestEnglishSpeechVoice();
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
    utterance.onend = () => {
      setSpeakingMessageIndex(null);
      setSpeechPaused(false);
    };
    utterance.onerror = () => {
      setSpeakingMessageIndex(null);
      setSpeechPaused(false);
    };
    setSpeakingMessageIndex(index);
    setSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
  }

  function toggleSpeech(content: string, index: number) {
    if (!("speechSynthesis" in window)) {
      setError("Tu navegador no soporta lectura en voz alta.");
      return;
    }

    if (speakingMessageIndex === index && window.speechSynthesis.speaking && !speechPaused) {
      window.speechSynthesis.pause();
      setSpeechPaused(true);
      return;
    }

    if (speakingMessageIndex === index && speechPaused) {
      window.speechSynthesis.resume();
      setSpeechPaused(false);
      return;
    }

    speakMessage(content, index);
  }

  function stopSpeech() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeakingMessageIndex(null);
    setSpeechPaused(false);
  }

  function insertDictationText(transcript: string) {
    const cleaned = transcript.replace(/\s+/g, " ").trim();
    if (!cleaned || !/[a-záéíóúñü]/i.test(cleaned)) return false;
    setInput((current) => [current.trim(), cleaned].filter(Boolean).join(current.trim() ? " " : ""));
    window.setTimeout(() => textareaRef.current?.focus(), 0);
    return true;
  }

  async function transcribeRecordedAudio(audioBlob: Blob) {
    if (audioBlob.size < 1200) {
      setError("No escuché suficiente audio. Intenta hablar un poco más cerca del micrófono.");
      return;
    }

    const formData = new FormData();
    const mimeType = audioBlob.type || "audio/webm";
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("audio", audioBlob, `english-os-dictation.${extension}`);
    formData.append("language", "en");

    try {
      const response = await fetch("/api/english-os/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.text) {
        throw new Error(data?.error || "Transcription failed.");
      }
      if (!insertDictationText(String(data.text))) {
        setError("No pude convertir el audio en texto útil. Intenta hablar más claro y con menos ruido de fondo.");
      }
    } catch {
      setError("No pude transcribir el audio. Puedes escribir tu respuesta o intentar de nuevo.");
    }
  }

  function stopMediaDictation() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setListening(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function startMediaDictation() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const preferredType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
    recordedAudioChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedAudioChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = recordedAudioChunksRef.current;
      recordedAudioChunksRef.current = [];
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setListening(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
      if (chunks.length) {
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void transcribeRecordedAudio(audioBlob);
      }
    };
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    setListening(true);
    recorder.start();
    window.setTimeout(() => textareaRef.current?.focus(), 0);
    return true;
  }

  async function startDictation() {
    if (mediaRecorderRef.current) {
      stopMediaDictation();
      return;
    }

    try {
      if (await startMediaDictation()) return;
    } catch {
      setError("No pude abrir el micrófono para grabar. Intentaré con el dictado básico del navegador.");
    }

    startBrowserDictation();
  }

  function startBrowserDictation() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Tu navegador no soporta dictado por micrófono. Puedes escribir tu respuesta normalmente.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setListening(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript && !insertDictationText(transcript)) setError("No pude convertir el audio en texto útil. Intenta hablar más claro y con menos ruido.");
    };
    recognition.onerror = () => {
      setError("No pude escuchar el micrófono. Revisa permisos del navegador e intenta otra vez.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError("No pude iniciar el micrófono. Revisa permisos del navegador e intenta otra vez.");
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }
  if (!authReady && !E2E_DEMO) {
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
    <main className="coach-shell h-[100dvh] max-w-full overflow-hidden" data-theme={theme} data-text-size={textSize}>
      <div className="mx-auto flex h-[100dvh] min-w-0 flex-col overflow-hidden p-2">
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
              {!E2E_DEMO && isLoaded && isSignedIn && <UserButton />}
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

        <CoachTopBar
          model={topBarModel}
          sidebarOpen={sidebarOpen}
          theme={theme}
          textSize={textSize}
          hydrated={hydrated}
          panelIcon={<CoachIcon name={sidebarOpen ? "panelOpen" : "panel"} />}
          userMenu={!E2E_DEMO && isLoaded && isSignedIn ? <UserButton /> : null}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onThemeChange={setTheme}
          onDecreaseText={() => setTextSize((size) => nextCoachTextSize(size, -1))}
          onIncreaseText={() => setTextSize((size) => nextCoachTextSize(size, 1))}
        />

        {error && <div className="mb-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{error}</div>}

        <div className={`coach-layout grid min-h-0 min-w-0 max-w-full flex-1 gap-2 ${sidebarOpen ? "coach-layout-open" : "coach-layout-closed"}`}>
          <section className="coach-chat order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border">
            <div className="coach-messages min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
              <CoachMessageList
                messages={chatMessageItems}
                loading={loading}
                agentLoading={agentLoading}
                activeAgentName={activeAgent.name}
                copiedMessageIndex={copiedMessageIndex}
                messageFeedback={messageFeedback}
                speakingMessageIndex={speakingMessageIndex}
                speechPaused={speechPaused}
                onToggleSpeech={toggleSpeech}
                onStopOrRestartSpeech={(content, index) => (speakingMessageIndex === index ? stopSpeech() : speakMessage(content, index))}
                onToggleFeedback={toggleMessageFeedback}
                onReportMessage={reportMessage}
                onCopyMessage={copyMessage}
                onStopThinking={stopThinking}
              />
              <div ref={bottomRef} />
            </div>

            <CoachComposer
              input={input}
              selectedImage={composerImage}
              hydrated={hydrated}
              loading={loading}
              listening={listening}
              imageInputRef={imageInputRef}
              textareaRef={textareaRef}
              onImageSelected={handleImageSelected}
              onClearImage={() => setSelectedImage(null)}
              onInputChange={setInput}
              onStartDictation={startDictation}
              onSendMessage={sendMessage}
              onStopThinking={stopThinking}
            />
          </section>

          {sidebarOpen && <aside id="coach-sidebar" className="coach-sidebar order-1 min-w-0 max-w-full space-y-2 overflow-x-hidden">
            <CoachStudyPanel
              model={studyPanelModel}
              onStudyUnitChange={(unit) => {
                setStudyUnit(unit);
                setStudyMode("class");
                setCoachSession(createCoachSessionContract({
                  mode: "class",
                  savedUnit: currentUnit,
                  savedLesson: currentLesson,
                  activeUnit: unit,
                  activeClassNumber: null,
                  lessonTitle: currentLesson,
                  resourcesUnit: unit,
                  source: "request",
                }));
              }}
              onStudyUnitBlur={(unit) => {
                const normalizedUnit = normalizeUnitValue(unit);
                setStudyUnit(normalizedUnit);
                setCoachSession(createCoachSessionContract({
                  mode: "class",
                  savedUnit: currentUnit,
                  savedLesson: currentLesson,
                  activeUnit: normalizedUnit,
                  activeClassNumber: null,
                  lessonTitle: currentLesson,
                  resourcesUnit: normalizedUnit,
                  source: "request",
                }));
              }}
              onUseSavedPosition={() => {
                setStudyUnit(normalizeUnitValue(currentUnit));
                setStudyMode("current");
                setCoachSession(createCoachSessionContract({
                  mode: "current",
                  savedUnit: currentUnit,
                  savedLesson: currentLesson,
                  activeUnit: currentUnit,
                  lessonTitle: currentLesson,
                  resourcesUnit: currentUnit,
                  source: "english_os",
                }));
              }}
              onStartClass={startTodayClass}
            />

            <CoachLearningPulsePanel
              model={learningPulsePanelModel}
            />

            <CoachGuidesPanel
              model={guidesPanelModel}
              onCreateGrammarWorkbook={() => createWorkbook("grammar")}
              onCreateVocabularyWorkbook={() => createWorkbook("vocabulary")}
              onRequestGrammarGuide={requestUnitGrammar}
              onRequestVocabularyGuide={requestUnitVocabulary}
            />

              <CoachQuickHelpPanel
                model={quickHelpPanelModel}
                onSelectAgent={(agentId) => setActiveAgentId(agentId as AgentId)}
                onRunAgent={(agentId) => {
                  setActiveAgentId(agentId as AgentId);
                  sendAgentMessage(undefined, agentId as AgentId);
                }}
              />

            <CoachClassMaterialsPanel
              model={classMaterialsPanelModel}
              onToggleResource={(resourceId) => setExpandedResourceId((current) => current === resourceId ? null : resourceId)}
              onPracticeResource={requestResourcePractice}
            />
          </aside>}
        </div>
      </div>
    </main>
  );
}
