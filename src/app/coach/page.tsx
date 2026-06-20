"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { EnglishOsLogo } from "@/components/EnglishOsLogo";
import { MarkdownMessage } from "@/components/MarkdownMessage";

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
type CoachTheme = "slate" | "paper" | "sage" | "sand" | "blue";
type CoachTextSize = "compact" | "normal" | "large";
type StudyMode = "current" | "class" | "review" | "guide";

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
const FALLBACK_UNIT = "Unit 1";
const PROGRESS_STATUS = "Evaluación pendiente";
const COACH_TEXT_SIZE_ORDER: CoachTextSize[] = ["compact", "normal", "large"];

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
  return number ? `Unit ${number}` : value || FALLBACK_UNIT;
}

function normalizeUnitValue(value: string) {
  return unitLabel(value);
}

function buildTodayClassMessage(unit: string, lesson: string) {
  return buildInitialCoachMessage(unit, lesson);
}

function buildInitialCoachMessage(unit: string, lesson: string, progressSnapshot = "") {
  return [
    "Hola, Pedro. Soy tu profesor de English OS y hoy vamos a trabajar paso a paso.",
    "",
    `Unidad activa: ${unitLabel(unit)}`,
    `Clase / lección actual: ${lesson || "Clase guiada de English OS"}`,
    progressSnapshot ? `Avance: ${progressSnapshot}` : "",
    "",
    "Puedes empezar la explicación, pedir una pista, practicar gramática o responder la evaluación pendiente. Yo mantengo el avance bloqueado hasta que la evaluación quede aprobada.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
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
    "Usa los contratos reales de la unidad en English OS.",
    "Hazla como una guía compacta por prioridades, no como una clase completa. No menciones Passages ni pidas el índice.",
  ].join(" ");
}

function buildUnitVocabularyPrompt(unit: string) {
  const number = extractUnitNumber(unit);
  return [
    number ? `Dame una guía de vocabulario de la unidad ${number}.` : "Dame una guía de vocabulario de mi unidad actual.",
    "Usa los contratos reales de la unidad en English OS.",
    "Hazla como una guía compacta por prioridades, no como una clase completa. No menciones Passages ni pidas el índice.",
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

function nextCoachTextSize(current: CoachTextSize, direction: -1 | 1) {
  const currentIndex = COACH_TEXT_SIZE_ORDER.indexOf(current);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), COACH_TEXT_SIZE_ORDER.length - 1);
  return COACH_TEXT_SIZE_ORDER[nextIndex] || "normal";
}

function stripEphemeralImages(messages: Message[]) {
  return messages.map((message) => (message.image ? { ...message, image: undefined } : message));
}

function SvgIcon({ name }: { name: "panel" | "panelOpen" | "play" | "pause" | "stop" | "restart" | "copy" | "check" | "mic" | "send" | "thumbsUp" | "thumbsDown" | "flag" }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
  const paths: Record<typeof name, ReactNode> = {
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" {...common} /><path d="M9 4v16M5.5 9h1M5.5 12h1M5.5 15h1" {...common} /></>,
    panelOpen: <><rect x="3" y="4" width="18" height="16" rx="2" {...common} /><path d="M15 4v16M8 9l-3 3 3 3" {...common} /></>,
    play: <path d="M8 5v14l11-7z" fill="currentColor" />,
    pause: <><path d="M8 5v14" {...common} /><path d="M16 5v14" {...common} /></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" />,
    restart: <><path d="M4 12a8 8 0 1 0 2.34-5.66" {...common} /><path d="M4 4v6h6" {...common} /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" {...common} /><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" {...common} /></>,
    check: <path d="M20 6 9 17l-5-5" {...common} />,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" {...common} /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" {...common} /></>,
    send: <><path d="M12 19V5" {...common} /><path d="m5 12 7-7 7 7" {...common} /></>,
    thumbsUp: <><path d="M7 10v10" {...common} /><path d="M11 10V5a3 3 0 0 1 3 3v2h4.2a2 2 0 0 1 1.95 2.45l-1.15 5A2 2 0 0 1 17.05 19H7" {...common} /><path d="M3 10h4v10H3z" {...common} /></>,
    thumbsDown: <><path d="M7 14V4" {...common} /><path d="M11 14v5a3 3 0 0 0 3-3v-2h4.2a2 2 0 0 0 1.95-2.45l-1.15-5A2 2 0 0 0 17.05 5H7" {...common} /><path d="M3 4h4v10H3z" {...common} /></>,
    flag: <><path d="M6 21V5" {...common} /><path d="M6 5h10l-1.2 4L16 13H6" {...common} /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="coach-svg-icon">{paths[name]}</svg>;
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
  const recommended = context?.recommendedCurrentPosition || data?.recommendedCurrentPosition || {};
  const current = context?.currentPosition || data?.currentPosition || {};
  const missionControl = context?.missionControl || data?.missionControl || context || {};

  return {
    unit:
      recommended.unit ||
      recommended.currentUnit ||
      current.unit ||
      current.currentUnit ||
      missionControl.currentUnit ||
      missionControl.CurrentUnit ||
      missionControl.unit ||
      "",
    lesson:
      recommended.lesson ||
      recommended.currentLesson ||
      current.lesson ||
      current.currentLesson ||
      missionControl.currentLesson ||
      missionControl.CurrentLesson ||
      missionControl.lesson ||
      "",
  };
}

function firstProgressValue(...values: unknown[]) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
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
  const email = user?.primaryEmailAddress?.emailAddress || "pfigueroamiranda@gmail.com";

  const [messages, setMessages] = useState<Message[]>(initialCoachMessages);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<{ dataUrl: string; name?: string; mimeType?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [error, setError] = useState("");
  const [agentError, setAgentError] = useState("");
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("grammar_corrector");
  const [currentUnit, setCurrentUnit] = useState(E2E_DEMO ? DEMO_UNIT : FALLBACK_UNIT);
  const [currentLesson, setCurrentLesson] = useState(E2E_DEMO ? DEMO_LESSON : "");
  const [studyUnit, setStudyUnit] = useState(E2E_DEMO ? DEMO_UNIT : FALLBACK_UNIT);
  const [studyMode, setStudyMode] = useState<StudyMode>("current");
  const [studyClassNumber, setStudyClassNumber] = useState<number | null>(null);
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
  const coachAbortRef = useRef<AbortController | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);

  const activeAgent = SPECIALIST_AGENTS.find((agent) => agent.id === activeAgentId) || SPECIALIST_AGENTS[0];
  const activeStudyUnit = studyUnit || currentUnit;
  const activeStudyUnitLabel = unitLabel(activeStudyUnit);
  const activeLocationLabel = [activeStudyUnitLabel, studyClassNumber ? `Class ${studyClassNumber}` : ""].filter(Boolean).join(" · ");
  const conversationStorageKey = email ? `english-os-coach:${email}` : "";

  useEffect(() => {
    setHydrated(true);
    const storedTheme = window.localStorage.getItem("english-os-coach-theme") as CoachTheme | null;
    const storedTextSize = window.localStorage.getItem("english-os-coach-text-size") as CoachTextSize | null;
    const storedSidebar = window.localStorage.getItem("english-os-coach-sidebar");
    if (storedTheme && ["slate", "paper", "sage", "sand", "blue"].includes(storedTheme)) setTheme(storedTheme);
    if (storedTextSize && COACH_TEXT_SIZE_ORDER.includes(storedTextSize)) setTextSize(storedTextSize);
    if (storedSidebar === "closed") setSidebarOpen(false);
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
  }, [authReady, signedIn, conversationStorageKey]);

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
      const resolvedUnit = normalizeUnitValue(unit || FALLBACK_UNIT);
      const progressSnapshot = buildProgressSnapshot(data);

      setCurrentUnit(resolvedUnit);
      setStudyUnit((current) => current || resolvedUnit);
      if (lesson) setCurrentLesson(lesson);

      setMessages((current) => {
        const shouldReplace = current.length === 1 && current[0]?.content.includes("Loading your English OS class plan");
        return shouldReplace ? [{ role: "coach", content: buildInitialCoachMessage(resolvedUnit, lesson, progressSnapshot) }] : current;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown context error";
      setContextError(message);
      setCurrentUnit((current) => current || FALLBACK_UNIT);
      setStudyUnit((current) => current || FALLBACK_UNIT);
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
      setResources(data.resources || []);
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
        {
          role: "coach",
          content: [
            `Listo. Generé la guía de ${isGrammar ? "gramática" : "vocabulario"} para ${unitLabel(unit)}.`,
            "",
            data.exportUrl ? `- [Descargar XLSX](${data.exportUrl})` : "",
            data.fileUrl ? `- [Abrir en Sheets](${data.fileUrl})` : "",
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
    const controller = new AbortController();
    agentAbortRef.current = controller;

    try {
      const response = await fetch("/api/english-os/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ agentId: activeAgent.id, message }),
      });
      const data = await readJsonResponse(response);
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
      const unit = data.activeUnit ? `Unit ${data.activeUnit}` : "";
      const lesson = savedPosition.lesson;
      const nextMode: StudyMode = isReviewRequest(message) ? "review" : isGuideRequest(message) ? "guide" : "class";

      if (unit) {
        setStudyUnit(normalizeUnitValue(unit));
        setStudyMode(nextMode);
      }
      setStudyClassNumber(data.activeClass && nextMode === "class" ? Number(data.activeClass) : null);
      if (lesson) setCurrentLesson(lesson);

      setMessages((current) => [
        ...current,
        { role: "coach", content: data.reply || "No response returned.", usage: data.usage },
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

  function startTodayClass() {
    sendMessage(buildStartTodayClassPrompt(activeStudyUnit, studyMode === "current" ? currentLesson : ""));
  }

  function requestUnitGrammar() {
    sendMessage(buildUnitGrammarPrompt(activeStudyUnit));
  }

  function requestUnitVocabulary() {
    sendMessage(buildUnitVocabularyPrompt(activeStudyUnit));
  }

  function requestHint() {
    sendMessage(buildHintPrompt(activeStudyUnit, studyMode === "current" ? currentLesson : ""));
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

  function startDictation() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Tu navegador no soporta dictado por micrófono. Puedes escribir tu respuesta normalmente.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) setInput((current) => [current, transcript].filter(Boolean).join(current ? " " : ""));
    };
    recognition.onerror = () => {
      setError("No pude escuchar el micrófono. Revisa permisos del navegador e intenta otra vez.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function renderWorkbookCard(kind: "grammar" | "vocabulary", workbook: Workbook | null) {
    if (!workbook) return null;
    const label = kind === "grammar" ? "gramática" : "vocabulario";
    return (
      <div className="coach-workbook-card rounded-2xl border p-3 text-sm">
        <p className="font-semibold">Guía de {label} generada</p>
        <p className="mt-1 break-words text-xs">{workbook.title}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={workbook.exportUrl} target="_blank" rel="noreferrer" className="coach-workbook-link rounded-xl px-3 py-2 text-center text-xs font-semibold">
            XLSX
          </a>
          <a href={workbook.fileUrl} target="_blank" rel="noreferrer" className="coach-workbook-link rounded-xl px-3 py-2 text-center text-xs font-semibold">
            Sheets
          </a>
        </div>
      </div>
    );
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

        <div className="coach-toolbar mb-2 flex min-h-10 items-center gap-2 rounded-xl border px-2 py-1.5">
          <button type="button" className="coach-icon-button coach-panel-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="coach-sidebar" aria-label={sidebarOpen ? "Ocultar panel" : "Mostrar panel"} title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}>
            <SvgIcon name={sidebarOpen ? "panelOpen" : "panel"} />
          </button>
          <div className="coach-font-controls" aria-label="Tamaño de texto">
            <button type="button" className="coach-font-button" onClick={() => setTextSize((size) => nextCoachTextSize(size, -1))} disabled={textSize === "compact"} aria-label="Disminuir tamaño de texto" title="Texto más pequeño">
              A−
            </button>
            <button type="button" className="coach-font-button" onClick={() => setTextSize((size) => nextCoachTextSize(size, 1))} disabled={textSize === "large"} aria-label="Aumentar tamaño de texto" title="Texto más grande">
              A+
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium">
            <span className="hidden sm:inline">Tema</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value as CoachTheme)} className="coach-theme-select rounded-lg border px-2 py-1.5">
              <option value="paper">Papel</option>
              <option value="sage">Salvia</option>
              <option value="sand">Arena</option>
              <option value="blue">Azul</option>
              <option value="slate">Pizarra</option>
            </select>
          </label>
          <span className="coach-status ml-auto truncate">
            <EnglishOsLogo size="sm" showText={false} markClassName="coach-status-logo" />
            <span className="coach-status-brand">English OS</span>
            <span className="coach-status-separator">—</span>
            <span>{studyModeLabel(studyMode)}</span>
            <span className="coach-status-separator">—</span>
            <span>{activeLocationLabel}</span>
          </span>
          {!E2E_DEMO && isLoaded && isSignedIn && <UserButton />}
        </div>

        {error && <div className="mb-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{error}</div>}

        <div className={`coach-layout grid min-h-0 min-w-0 max-w-full flex-1 gap-2 ${sidebarOpen ? "coach-layout-open" : "coach-layout-closed"}`}>
          <section className="coach-chat order-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border">
            <div className="coach-messages min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
              {messages.map((message, index) => (
                <article key={index} className={`coach-message ${message.role === "user" ? "coach-message-user" : "coach-message-teacher"}`}>
                  {message.role === "user" ? (
                    <>
                      <p className="coach-user-message-line">
                        <span className="coach-user-message-label">Tú —</span>
                        <span className="coach-user-message-content">{message.content}</span>
                      </p>
                      {message.image && (
                        <figure className="coach-message-image not-prose">
                          <img src={message.image.dataUrl} alt={message.image.name || "Imagen enviada por el estudiante"} />
                        </figure>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="coach-message-label">
                        <p>Profesor dijo:</p>
                      </div>
                      <div className="coach-message-actions not-prose">
                        <button
                          type="button"
                          onClick={() => toggleSpeech(message.content, index)}
                          className={`coach-round-button ${speakingMessageIndex === index ? "coach-speaking-button" : ""}`}
                          aria-label={speakingMessageIndex === index && !speechPaused ? "Pausar lectura" : speechPaused && speakingMessageIndex === index ? "Continuar lectura" : "Escuchar respuesta del profesor"}
                          title={speakingMessageIndex === index && !speechPaused ? "Pausar" : speechPaused && speakingMessageIndex === index ? "Continuar" : "Escuchar"}
                        >
                          <SvgIcon name={speakingMessageIndex === index && !speechPaused ? "pause" : "play"} />
                        </button>
                        <button
                          type="button"
                          onClick={() => (speakingMessageIndex === index ? stopSpeech() : speakMessage(message.content, index))}
                          className="coach-round-button"
                          aria-label={speakingMessageIndex === index ? "Detener lectura" : "Reiniciar lectura"}
                          title={speakingMessageIndex === index ? "Detener" : "Reiniciar"}
                        >
                          <SvgIcon name={speakingMessageIndex === index ? "stop" : "restart"} />
                        </button>
                        <button type="button" onClick={() => toggleMessageFeedback(index, "like")} className={`coach-round-button ${messageFeedback[index] === "like" ? "coach-feedback-active" : ""}`} aria-label={messageFeedback[index] === "like" ? "Quitar me gusta" : "Marcar respuesta como útil"} aria-pressed={messageFeedback[index] === "like"} title={messageFeedback[index] === "like" ? "Quitar me gusta" : "Me gusta"}>
                          <SvgIcon name="thumbsUp" />
                        </button>
                        <button type="button" onClick={() => toggleMessageFeedback(index, "dislike")} className={`coach-round-button ${messageFeedback[index] === "dislike" ? "coach-feedback-active" : ""}`} aria-label={messageFeedback[index] === "dislike" ? "Quitar no me gusta" : "Marcar respuesta como no útil"} aria-pressed={messageFeedback[index] === "dislike"} title={messageFeedback[index] === "dislike" ? "Quitar no me gusta" : "No me gusta"}>
                          <SvgIcon name="thumbsDown" />
                        </button>
                        <button type="button" onClick={() => reportMessage(message.content, index)} className="coach-round-button" aria-label="Reportar error en esta respuesta" title="Reportar error">
                          <SvgIcon name="flag" />
                        </button>
                        <button type="button" onClick={() => copyMessage(message.content, index)} className="coach-round-button" aria-label="Copiar mensaje" title={copiedMessageIndex === index ? "Copiado" : "Copiar"}>
                          <SvgIcon name={copiedMessageIndex === index ? "check" : "copy"} />
                        </button>
                      </div>
                      <div className="prose max-w-none whitespace-pre-wrap text-sm sm:text-base">
                        <MarkdownMessage content={message.content} />
                      </div>
                    </>
                  )}
                </article>
              ))}
              {(loading || agentLoading) && (
                <div className="coach-thinking text-sm" aria-live="polite">
                  <span>{agentLoading ? `${activeAgent.name} está pensando` : "El profesor está pensando"}</span>
                  <span className="coach-thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
                  <button type="button" onClick={stopThinking} className="coach-thinking-stop" aria-label="Parar respuesta del profesor" title="Parar">
                    <SvgIcon name="stop" />
                  </button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <footer className="coach-composer sticky bottom-0 z-10 border-t px-3 py-1.5 backdrop-blur">
              {selectedImage && (
                <div className="coach-image-preview">
                  <img src={selectedImage.dataUrl} alt={selectedImage.name || "Imagen seleccionada"} />
                  <span className="truncate">{selectedImage.name || "Imagen para vocabulario"}</span>
                  <button type="button" onClick={() => setSelectedImage(null)} aria-label="Quitar imagen" title="Quitar imagen">
                    ×
                  </button>
                </div>
              )}
              <div className="coach-input-row flex items-end gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleImageSelected(event.target.files?.[0])}
                />
                <div className="coach-text-input-shell flex-1">
                  <button type="button" onClick={() => imageInputRef.current?.click()} disabled={!hydrated || loading} className="coach-inline-plus-button" aria-label="Agregar foto para vocabulario" title="Agregar foto">
                    +
                  </button>
                  <textarea
                    ref={textareaRef}
                    rows={1}
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
                    className="coach-textarea block w-full resize-none rounded-xl border py-1.5 pl-11 pr-3 text-base outline-none"
                  />
                </div>
                <button type="button" onClick={startDictation} disabled={!hydrated || loading} className={`coach-round-button coach-mic-button ${listening ? "coach-mic-active" : ""}`} aria-label={listening ? "Detener micrófono" : "Dictar con micrófono"} title={listening ? "Detener micrófono" : "Micrófono"}>
                  <SvgIcon name="mic" />
                </button>
                <button onClick={() => (loading ? stopThinking() : sendMessage())} disabled={!hydrated || (!loading && !input.trim() && !selectedImage)} className="coach-send-button disabled:cursor-not-allowed disabled:opacity-40" aria-label={loading ? "Parar respuesta del profesor" : "Enviar respuesta"} title={loading ? "Parar" : "Enviar"}>
                  <SvgIcon name={loading ? "stop" : "send"} />
                </button>
              </div>
            </footer>
          </section>

          {sidebarOpen && <aside id="coach-sidebar" className="coach-sidebar order-1 min-w-0 max-w-full space-y-2 overflow-x-hidden">
            <section className="coach-panel min-w-0 max-w-full overflow-hidden rounded-xl border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-60">Objetivo activo</p>
              <h2 className="mt-1 text-lg font-bold">{activeLocationLabel}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-60">Modo: {studyModeLabel(studyMode)}</p>
              <p className="mt-1 text-xs opacity-70">Posición guardada: {contextLoading ? "Cargando…" : unitLabel(currentUnit)}</p>
              <p className="mt-1 text-sm opacity-75">Los materiales siguen la unidad activa de estudio.</p>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unidad de estudio</label>
              <input value={studyUnit} onChange={(event) => { setStudyUnit(event.target.value); setStudyMode("class"); }} onBlur={(event) => setStudyUnit(normalizeUnitValue(event.target.value))} placeholder={unitLabel(currentUnit)} className="coach-input mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setStudyUnit(normalizeUnitValue(currentUnit)); setStudyMode("current"); }} disabled={!currentUnit} className="coach-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Usar posición
                </button>
                <button type="button" onClick={startTodayClass} disabled={loading || !activeStudyUnit} className="coach-action-primary rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50">
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
              <select value={activeAgentId} onChange={(event) => setActiveAgentId(event.target.value as AgentId)} style={{ colorScheme: "dark" }} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500">
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
              {resourcesNotice && <div className="mt-3 rounded-2xl border border-slate-300 bg-white/70 p-4 text-sm leading-6 text-slate-600">{resourcesNotice}</div>}
              {resourcesError && <div className="mt-3 rounded-2xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">{resourcesError}</div>}
              {!resourcesLoading && !resourcesError && !resourcesNotice && resources.length === 0 && <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">No hay materiales cargados para esta unidad.</div>}
              <div className="mt-3 min-w-0 max-w-full space-y-3">
                {resources.map((resource) => (
                  <div key={resource.resourceId} data-testid="resource-card" className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 break-all text-sm font-semibold text-slate-100" title={resource.title}>{resource.title}</h3>
                      <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase text-slate-400">{resource.type}</span>
                    </div>
                    <p className="mb-3 break-words text-xs leading-5 text-slate-400">{resource.description}</p>
                    {resource.embedUrl && (
                      <button
                        type="button"
                        onClick={() => setExpandedResourceId((current) => current === resource.resourceId ? null : resource.resourceId)}
                        className="mb-3 w-full rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                        aria-expanded={expandedResourceId === resource.resourceId}
                      >
                        {expandedResourceId === resource.resourceId ? "Ocultar reproductor" : "Cargar reproductor"}
                      </button>
                    )}
                    {expandedResourceId === resource.resourceId && resource.type === "audio" && resource.embedUrl && (
                      <div className="mb-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black">
                        <iframe src={resource.embedUrl} title={resource.title} className="block h-20 w-full min-w-0 max-w-full border-0" allow="autoplay" loading="lazy" />
                      </div>
                    )}
                    {expandedResourceId === resource.resourceId && resource.type === "video" && resource.embedUrl && (
                      <div className="mb-3 aspect-video min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black">
                        <iframe src={resource.embedUrl} title={resource.title} className="block h-full w-full min-w-0 max-w-full border-0" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
                      </div>
                    )}
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
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
          </aside>}
        </div>
      </div>
    </main>
  );
}
