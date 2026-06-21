"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  buildCoachReportMailto,
  buildCoachResourcePracticeMessage,
  copyCoachText,
  toggleCoachMessageFeedback,
} from "@/modules/coach-actions/coachActions";
import { createCoachApiClient } from "@/modules/coach-api/coachApiClient";
import { toCoachComposerModel } from "@/modules/coach-chat/composerViewModel";
import { toCoachMessageListModel } from "@/modules/coach-chat/messageListViewModel";
import {
  buildInitialCoachMessage,
  buildInitialCoachMessages,
  buildLearningPulse,
  buildProgressSnapshot,
  extractUnitNumber,
  getLearnerDisplayName,
  getSavedPosition,
  learningPulseDetail,
  normalizeUnitValue,
  unitLabel,
  type CoachLearningPulse,
} from "@/modules/coach-context/coachContext";
import {
  createAgentCoachMessage,
  createCoachErrorMessage,
  createDemoAgentTurn,
  createDemoCoachTurn,
  coachModeFromStudyMode,
  prepareAgentMessageTurn,
  prepareCoachMessageTurn,
  resolveCoachResponseState,
  type CoachStudyMode,
} from "@/modules/coach-controller/coachController";
import { toCoachAgentClientContracts } from "@/modules/coach-integrations/agentsContract";
import {
  chooseMediaRecorderMimeType,
  createDictationFormData,
  isDictationAudioTooShort,
  prepareImageForVocabulary,
} from "@/modules/coach-media/coachMedia";
import {
  getCoachConversationStorageKey,
  loadCoachConversation,
  loadCoachPreferences,
  saveCoachConversation,
  saveCoachPreferences,
} from "@/modules/coach-persistence/coachPersistence";
import { renderClientPrompt, type ClientPromptId } from "@/modules/coach-prompts/clientPromptRegistry";
import {
  focusTextareaSoon,
  insertDictationTranscript,
  isAbortError,
  speakCoachMessageRuntime,
  startBrowserDictationRuntime,
  stopCoachSpeechRuntime,
  stopCoachThinkingRuntime,
  stopMediaDictationRuntime,
  toggleCoachSpeechRuntime,
} from "@/modules/coach-runtime/coachRuntime";
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
type StudyMode = CoachStudyMode;

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
const COACH_TEXT_SIZE_ORDER: CoachTextSize[] = ["compact", "normal", "large"];
const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 260;
const MAX_SIDEBAR_WIDTH = 560;

const SPECIALIST_AGENTS: SpecialistAgent[] = [
  {
    id: "grammar_corrector",
    name: "Corrector de gramatica",
    shortName: "Gramatica",
    description: "Corrige estructura, articulos, preposiciones y naturalidad.",
    defaultPromptId: "agents.grammarCorrector.default",
  },
  {
    id: "speaking_partner",
    name: "Companero de speaking",
    shortName: "Speaking",
    description: "Practica conversacion, fluidez y respuestas profesionales.",
    defaultPromptId: "agents.speakingPartner.default",
  },
  {
    id: "english_evaluator",
    name: "Evaluador B1/B2",
    shortName: "Evaluar",
    description: "Evalua CEFR, precision, vocabulario y proximos pasos.",
    defaultPromptId: "agents.englishEvaluator.default",
  },
];

const SPECIALIST_AGENT_CONTRACTS = toCoachAgentClientContracts(SPECIALIST_AGENTS);

async function buildStartTodayClassPrompt(unit: string, lesson: string) {
  const unitNumber = extractUnitNumber(unit);
  return renderClientPrompt("coach.startCurrentClass", {
    startRequest: unitNumber
      ? `Empecemos la clase actual de la unidad ${unitNumber}. Usa el contrato real de English OS; si no hay numero de clase activo confiable, no inventes Class 1 y pide confirmacion breve.`
      : "Empecemos mi clase actual. Usa el contrato real de English OS; si no hay numero de clase activo confiable, no inventes Class 1 y pide confirmacion breve.",
    lessonContext: lesson ? `Contexto guardado de leccion o foco: ${lesson}` : "",
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
    requestLine: number ? `Dame una guia de gramatica de la unidad ${number}.` : "Dame una guia de gramatica de mi unidad actual.",
  });
}

async function buildUnitVocabularyPrompt(unit: string) {
  const number = extractUnitNumber(unit);
  return renderClientPrompt("coach.unitVocabularyGuide", {
    requestLine: number ? `Dame una guia de vocabulario de la unidad ${number}.` : "Dame una guia de vocabulario de mi unidad actual.",
  });
}

function initialCoachMessages(): Message[] {
  return buildInitialCoachMessages({
    e2eDemo: E2E_DEMO,
    demoUnit: DEMO_UNIT,
    demoLesson: DEMO_LESSON,
    demoLearnerName: "Pedro",
  });
}

function replaceInitialCoachGreeting(messages: Message[], freshInitialMessage: string) {
  const shouldReplaceLoading =
    messages.length === 1 &&
    messages[0]?.role === "coach" &&
    messages[0]?.content.includes("Loading your English OS class plan");
  if (shouldReplaceLoading) return [{ role: "coach" as const, content: freshInitialMessage }];

  const first = messages[0];
  const firstLooksLikeInitialGreeting =
    first?.role === "coach" &&
    first.content.includes("Soy tu profesor de English OS") &&
    first.content.includes("Unidad activa:");

  if (firstLooksLikeInitialGreeting) {
    return [{ ...first, content: freshInitialMessage }, ...messages.slice(1)];
  }

  return messages;
}

function studyModeLabel(mode: StudyMode) {
  if (mode === "review") return "Repaso";
  if (mode === "guide") return "Guia";
  if (mode === "class") return "Clase";
  return "Actual";
}

function nextCoachTextSize(current: CoachTextSize, direction: -1 | 1) {
  const currentIndex = COACH_TEXT_SIZE_ORDER.indexOf(current);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), COACH_TEXT_SIZE_ORDER.length - 1);
  return COACH_TEXT_SIZE_ORDER[nextIndex] || "normal";
}

export function useCoachPageController() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const authReady = isLoaded || authTimedOut || E2E_DEMO;
  const signedIn = isSignedIn || E2E_DEMO;
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
  const [learningPulse, setLearningPulse] = useState<CoachLearningPulse>(() => buildLearningPulse({}));
  const [theme, setTheme] = useState<CoachTheme>("paper");
  const [textSize, setTextSize] = useState<CoachTextSize>("compact");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "like" | "dislike">>({});
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [diagnosticChecks, setDiagnosticChecks] = useState<Array<{ name: string; ok: boolean; detail: string }>>([]);
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
  const coachApi = createCoachApiClient(fetch, email);

  const activeAgent = SPECIALIST_AGENT_CONTRACTS.find((agent) => agent.id === activeAgentId) || SPECIALIST_AGENT_CONTRACTS[0];
  const activeAgentMetadata = SPECIALIST_AGENTS.find((agent) => agent.id === activeAgentId) || SPECIALIST_AGENTS[0];
  const uiSession = createCoachSessionContract({
    mode: coachModeFromStudyMode(studyMode),
    savedUnit: currentUnit || coachSession.savedUnit,
    savedLesson: currentLesson || coachSession.savedLesson,
    activeUnit: coachSession.activeUnit || studyUnit || currentUnit,
    activeClassNumber: studyClassNumber || coachSession.activeClassNumber,
    lessonTitle: coachSession.lessonTitle || currentLesson,
    resourcesUnit: coachSession.resourcesUnit || coachSession.activeUnit || studyUnit || currentUnit,
    source: coachSession.source,
  });
  const activeStudyUnit = uiSession.resourcesUnit || uiSession.activeUnit || currentUnit;
  const activeStudyUnitLabel = unitLabel(activeStudyUnit);
  const activeLocationLabel = [activeStudyUnitLabel, studyClassNumber ? `Class ${studyClassNumber}` : ""].filter(Boolean).join(" - ");
  const learningPulseLabel = learningPulseDetail(learningPulse);
  const topBarModel = toCoachTopBarModel(uiSession, learningPulseLabel);
  const studyPanelModel = toCoachStudyPanelModel({
    session: uiSession,
    currentUnitLabel: unitLabel(currentUnit),
    contextLoading,
    studyUnitValue: uiSession.activeUnit || studyUnit,
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
  const diagnosticsPanelModel = {
    visible: !E2E_DEMO && Boolean(contextError || diagnosticsError || diagnosticChecks.length > 0),
    loading: diagnosticsLoading,
    error: diagnosticsError,
    checks: diagnosticChecks,
  };
  const chatMessageItems = messages.map((message) => ({
    role: message.role,
    content: message.content,
    image: message.image ? { dataUrl: message.image.dataUrl, name: message.image.name } : undefined,
  }));
  const messageListModel = toCoachMessageListModel({
    messages: chatMessageItems,
    loading,
    agentLoading,
    activeAgentName: activeAgent.name,
    copiedMessageIndex,
    messageFeedback,
    speakingMessageIndex,
    speechPaused,
  });
  const composerImage = selectedImage ? { dataUrl: selectedImage.dataUrl, name: selectedImage.name } : null;
  const composerModel = toCoachComposerModel({
    input,
    selectedImage: composerImage,
    hydrated,
    loading,
    listening,
  });
  const conversationStorageKey = getCoachConversationStorageKey(email);

  useEffect(() => {
    setHydrated(true);
    const preferences = loadCoachPreferences(window.localStorage, {
      isSmallViewport: window.matchMedia("(max-width: 640px)").matches,
    });
    if (preferences.theme) setTheme(preferences.theme);
    if (preferences.textSize && COACH_TEXT_SIZE_ORDER.includes(preferences.textSize)) setTextSize(preferences.textSize);
    if (typeof preferences.sidebarOpen === "boolean") setSidebarOpen(preferences.sidebarOpen);
    if (typeof preferences.sidebarWidth === "number") setSidebarWidth(preferences.sidebarWidth);
  }, []);

  useEffect(() => {
    if (isLoaded || E2E_DEMO) return;
    const timer = window.setTimeout(() => setAuthTimedOut(true), 3500);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    if (!hydrated) return;
    saveCoachPreferences(window.localStorage, { theme, textSize, sidebarOpen, sidebarWidth });
  }, [hydrated, theme, textSize, sidebarOpen, sidebarWidth]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (conversationStorageKey && messages.length > 0 && !E2E_DEMO) {
      saveCoachConversation(window.localStorage, conversationStorageKey, messages, { maxMessages: 40 });
    }
  }, [messages, loading, agentLoading, conversationStorageKey]);

  useEffect(() => {
    if (E2E_DEMO) return;
    if (!authReady || !signedIn) return;

    const savedMessages = loadCoachConversation(window.localStorage, conversationStorageKey);
    if (savedMessages.length > 0) setMessages(savedMessages);

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
      const data = await coachApi.getContext();

      const { unit, lesson, classNumber } = getSavedPosition(data);
      const resolvedUnit = unit ? normalizeUnitValue(unit) : "";
      const progressSnapshot = buildProgressSnapshot(data);
      setCoachSession(createCoachSessionContract({
        mode: classNumber ? "class" : "current",
        savedUnit: resolvedUnit || null,
        savedLesson: lesson || null,
        activeUnit: resolvedUnit || null,
        activeClassNumber: classNumber,
        lessonTitle: lesson || null,
        resourcesUnit: resolvedUnit || null,
        source: "english_os",
      }));

      if (resolvedUnit) {
        setCurrentUnit(resolvedUnit);
        setStudyUnit(resolvedUnit);
      }
      if (classNumber) {
        setStudyClassNumber(classNumber);
        setStudyMode("class");
      }
      if (lesson) setCurrentLesson(lesson);
      setLearningPulse(buildLearningPulse(data));

      setMessages((current) =>
        replaceInitialCoachGreeting(
          current,
          buildInitialCoachMessage(resolvedUnit || "tu posición actual", lesson, progressSnapshot, learnerName),
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown context error";
      setContextError(message);
      void runDiagnostics();
      setCurrentUnit((current) => current || "");
      setStudyUnit((current) => current || "");
      setMessages((current) => {
        const shouldReplace = current.length === 1 && current[0]?.content.includes("Loading your English OS class plan");
        if (!shouldReplace) return current;
        return [
          {
            role: "coach",
            content:
              "No pude cargar tu English plan todavia, pero no voy a dejar la clase bloqueada.\n\nPuedes pedir una clase, un repaso o practicar una unidad. Cuando la conexion con English OS vuelva a responder, recuperare tu posicion guardada automaticamente.",
          },
        ];
      });
    } finally {
      setContextLoading(false);
    }
  }

  async function runDiagnostics() {
    if (E2E_DEMO || diagnosticsLoading) return;
    setDiagnosticsLoading(true);
    setDiagnosticsError("");
    try {
      const data = await coachApi.getDiagnostics();
      const checks = Array.isArray(data?.checks) ? data.checks : [];
      setDiagnosticChecks(checks);
      if (data?.ok === false) {
        setDiagnosticsError("El diagnostico encontro uno o mas puntos para revisar.");
      }
    } catch (err) {
      setDiagnosticsError(err instanceof Error ? err.message : "No pude ejecutar el diagnostico.");
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function loadDriveUnitResources(unit: string) {
    setResourcesLoading(true);
    setResourcesError("");
    setResourcesNotice("");
    try {
      const data = await coachApi.getDriveUnitResources(unit);
      setResources(Array.isArray(data.resources) ? data.resources : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown resources error";
      if (/Missing English OS environment variables/i.test(message)) {
        setResourcesNotice(
          "Los materiales conectados no estan configurados en este entorno local. Para cargarlos aqui hacen falta ENGLISH_OS_BASE_URL y ENGLISH_OS_TOKEN en .env.local."
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
      const data = await coachApi.createWorkbook({
        kind,
        unit,
        lesson: studyMode === "current" ? currentLesson : "",
      });

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
            `Listo. Genere la guia de ${isGrammar ? "gramatica" : "vocabulario"} para ${unitLabel(unit)}.`,
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
    const prepared = prepareAgentMessageTurn({
      customMessage,
      input,
      defaultPrompt,
      agent: targetAgent,
      agentLoading,
    });
    if (!prepared) return;

    if (E2E_DEMO) {
      setMessages((current) => [...current, ...createDemoAgentTurn(targetAgent, prepared)]);
      return;
    }

    setError("");
    setAgentError("");
    setInput("");
    setAgentLoading(true);
    setMessages((current) => [...current, prepared.userMessage]);
    const controller = new AbortController();
    agentAbortRef.current = controller;

    try {
      const data = await coachApi.sendAgentMessage({
        body: prepared.requestBody,
        signal: controller.signal,
      });
      setMessages((current) => [...current, createAgentCoachMessage(targetAgent, data)]);
    } catch (err) {
      if (isAbortError(err)) return;
      const message = err instanceof Error ? err.message : "Unknown agent error";
      setAgentError(message);
      setError(message);
    } finally {
      if (agentAbortRef.current === controller) agentAbortRef.current = null;
      setAgentLoading(false);
    }
  }

  async function sendMessage(customMessage?: string) {
    const prepared = prepareCoachMessageTurn({
      customMessage,
      input,
      selectedImage,
      messages,
      loading,
    });
    if (!prepared) return;

    if (E2E_DEMO) {
      setInput("");
      setSelectedImage(null);
      setMessages((current) => [...current, ...createDemoCoachTurn(prepared)]);
      return;
    }

    setError("");
    setInput("");
    setSelectedImage(null);
    setLoading(true);
    setMessages((current) => [...current, prepared.userMessage]);
    const controller = new AbortController();
    coachAbortRef.current = controller;

    try {
      const data = await coachApi.sendCoachMessage({
        body: prepared.requestBody,
        signal: controller.signal,
      });

      const next = resolveCoachResponseState({
        requestMessage: prepared.message,
        data,
        currentUnit,
        currentLesson,
        getSavedPosition,
      });

      setStudyMode(next.studyMode);
      setCoachSession(next.session);
      if (next.studyUnit) {
        setStudyUnit(normalizeUnitValue(next.studyUnit));
      }
      setStudyClassNumber(next.studyClassNumber);
      if (next.currentLesson) setCurrentLesson(next.currentLesson);

      setMessages((current) => [...current, next.coachMessage]);
    } catch (err) {
      if (isAbortError(err)) return;
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setMessages((current) => [
        ...current,
        createCoachErrorMessage(errorMessage),
      ]);
    } finally {
      if (coachAbortRef.current === controller) coachAbortRef.current = null;
      setLoading(false);
    }
  }

  function stopThinking() {
    stopCoachThinkingRuntime({
      coachAbortRef,
      agentAbortRef,
      setLoading,
      setAgentLoading,
    });
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
    sendMessage(buildCoachResourcePracticeMessage({ activeStudyUnitLabel, resource }));
  }

  async function copyMessage(content: string, index: number) {
    const copied = await copyCoachText(content, { clipboard: navigator.clipboard, document });
    if (!copied) return;

    setCopiedMessageIndex(index);
    window.setTimeout(() => setCopiedMessageIndex(null), 1200);
  }

  function reportMessage(content: string, index: number) {
    window.location.href = buildCoachReportMailto({
      content,
      index,
      activeLocationLabel,
      email,
      studyModeLabel: studyModeLabel(studyMode),
      href: window.location.href,
      nowIso: new Date().toISOString(),
    });
  }

  function toggleMessageFeedback(index: number, value: "like" | "dislike") {
    setMessageFeedback((current) => toggleCoachMessageFeedback(current, index, value));
  }

  function speakMessage(content: string, index: number) {
    return speakCoachMessageRuntime({
      content,
      index,
      windowObj: window,
      setError,
      setSpeakingMessageIndex,
      setSpeechPaused,
    });
  }

  function toggleSpeech(content: string, index: number) {
    toggleCoachSpeechRuntime({
      content,
      index,
      speakingMessageIndex,
      speechPaused,
      windowObj: window,
      setError,
      setSpeakingMessageIndex,
      setSpeechPaused,
      speakMessage,
    });
  }

  function stopSpeech() {
    stopCoachSpeechRuntime({
      windowObj: window,
      setSpeakingMessageIndex,
      setSpeechPaused,
    });
  }

  function insertDictationText(transcript: string) {
    return insertDictationTranscript({
      transcript,
      setInput,
      textareaRef,
    });
  }

  async function transcribeRecordedAudio(audioBlob: Blob) {
    if (isDictationAudioTooShort(audioBlob)) {
      setError("No escuche suficiente audio. Intenta hablar un poco mas cerca del microfono.");
      return;
    }

    const formData = createDictationFormData(audioBlob);

    try {
      const data = await coachApi.transcribeAudio(formData);
      if (!insertDictationText(String(data.text))) {
        setError("No pude convertir el audio en texto util. Intenta hablar mas claro y con menos ruido de fondo.");
      }
    } catch {
      setError("No pude transcribir el audio. Puedes escribir tu respuesta o intentar de nuevo.");
    }
  }

  function stopMediaDictation() {
    stopMediaDictationRuntime({
      mediaRecorderRef,
      mediaStreamRef,
      textareaRef,
      setListening,
    });
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
    const preferredType = chooseMediaRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
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
      focusTextareaSoon(textareaRef);
      if (chunks.length) {
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void transcribeRecordedAudio(audioBlob);
      }
    };
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    setListening(true);
    recorder.start();
    focusTextareaSoon(textareaRef);
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
      setError("No pude abrir el microfono para grabar. Intentare con el dictado basico del navegador.");
    }

    startBrowserDictation();
  }

  function startBrowserDictation() {
    startBrowserDictationRuntime({
      windowObj: window,
      recognitionRef,
      textareaRef,
      setListening,
      setError,
      insertDictationText,
    });
  }

  function handleStudyUnitChange(unit: string) {
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
  }

  function handleStudyUnitBlur(unit: string) {
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
  }

  function handleUseSavedPosition() {
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
  }

  function handleRunAgent(agentId: string) {
    setActiveAgentId(agentId as AgentId);
    sendAgentMessage(undefined, agentId as AgentId);
  }

  function resizeSidebarFromClientX(clientX: number) {
    const viewportWidth = window.innerWidth || 1280;
    const responsiveMax = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - 560));
    const nextWidth = Math.min(Math.max(Math.round(clientX), MIN_SIDEBAR_WIDTH), responsiveMax);
    setSidebarWidth(nextWidth);
  }

  function startSidebarResize(clientX: number) {
    if (typeof window === "undefined") return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    resizeSidebarFromClientX(clientX);

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      resizeSidebarFromClientX(event.clientX);
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  return {
    auth: {
      authReady,
      signedIn,
      isLoaded,
      isSignedIn,
      e2eDemo: E2E_DEMO,
    },
    state: {
      email,
      theme,
      textSize,
      hydrated,
      sidebarOpen,
      sidebarWidth,
      error,
      contextError,
      contextLoading,
      activeStudyUnit,
      activeStudyUnitLabel,
      currentLesson,
      loading,
      speakingMessageIndex,
    },
    refs: {
      bottomRef,
      textareaRef,
      imageInputRef,
    },
    models: {
      topBarModel,
      studyPanelModel,
      learningPulsePanelModel,
      guidesPanelModel,
      quickHelpPanelModel,
      classMaterialsPanelModel,
      diagnosticsPanelModel,
      messageListModel,
      composerModel,
    },
    actions: {
      setSidebarOpen,
      startSidebarResize,
      setTheme,
      decreaseTextSize: () => setTextSize((size) => nextCoachTextSize(size, -1)),
      increaseTextSize: () => setTextSize((size) => nextCoachTextSize(size, 1)),
      startTodayClass,
      requestHint,
      requestUnitGrammar,
      requestUnitVocabulary,
      handleImageSelected,
      clearImage: () => setSelectedImage(null),
      setInput,
      startDictation,
      sendMessage,
      stopThinking,
      toggleSpeech,
      stopSpeech,
      speakMessage,
      toggleMessageFeedback,
      reportMessage,
      copyMessage,
      handleStudyUnitChange,
      handleStudyUnitBlur,
      handleUseSavedPosition,
      createGrammarWorkbook: () => createWorkbook("grammar"),
      createVocabularyWorkbook: () => createWorkbook("vocabulary"),
      setActiveAgentId: (agentId: string) => setActiveAgentId(agentId as AgentId),
      handleRunAgent,
      runDiagnostics,
      toggleResource: (resourceId: string) => setExpandedResourceId((current) => current === resourceId ? null : resourceId),
      requestResourcePractice,
    },
  };
}
