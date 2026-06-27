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
  getLearnerDisplayName,
  getSavedPosition,
  learningPulseDetail,
  normalizeUnitValue,
  unitLabel,
  type CoachLearningPulse,
} from "@/modules/coach-context/coachContext";
import {
  createAgentCoachMessage,
  createDemoAgentTurn,
  prepareAgentMessageTurn,
} from "@/modules/coach-agents/application";
import { runCoachDiagnostics, type CoachDiagnosticTelemetry } from "@/modules/coach-diagnostics/application";
import { toCoachAgentClientContracts } from "@/modules/coach-integrations/agentsContract";
import {
  createCoachErrorMessage,
  createDemoCoachTurn,
  prepareCoachMessageTurn,
  resolveCoachResponseState,
  type CoachStudyMode,
} from "@/modules/coach-message/application";
import {
  chooseMediaRecorderMimeType,
  prepareImageForVocabulary,
} from "@/modules/coach-media/coachMedia";
import { transcribeCoachDictation } from "@/modules/coach-dictation/application";
import {
  buildHintMessage,
  buildStartTodayClassMessage,
  buildUnitGrammarGuideMessage,
  buildUnitVocabularyGuideMessage,
} from "@/modules/coach-learning-actions/application";
import {
  DEFAULT_SIDEBAR_WIDTH,
  isCoachTextSize,
  nextCoachTextSize,
  resolveCoachSidebarWidthFromClientX,
  type CoachTextSize,
  type CoachTheme,
} from "@/modules/coach-layout/application";
import {
  getCoachConversationStorageKey,
  loadCoachConversation,
  loadCoachPreferences,
  saveCoachConversation,
  saveCoachPreferences,
} from "@/modules/coach-persistence/coachPersistence";
import { renderClientPrompt, type ClientPromptId } from "@/modules/coach-prompts/clientPromptRegistry";
import { loadCoachResources, type CoachResource } from "@/modules/coach-resources/application";
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
import {
  createContextLoadedSession,
  createInitialCoachSession,
  createSavedPositionSession,
  createSelectedUnitSession,
  resolveCoachUiSession,
} from "@/modules/coach-session/application";
import type { CoachSessionState } from "@/modules/coach-session/types";
import {
  toCoachClassMaterialsPanelModel,
  toCoachDiagnosticsPanelModel,
  toCoachGuidesPanelModel,
  toCoachLearningPulsePanelModel,
  toCoachQuickHelpPanelModel,
  toCoachStudyPanelModel,
  toCoachTopBarModel,
} from "@/modules/coach-session/viewModels";
import { createCoachWorkbook } from "@/modules/coach-workbooks/application";
import type { CoachWorkbookContract } from "@/modules/coach-integrations/workbookContract";
import type { CoachPageDispatch } from "./pageViewModel";
import { presentCoachPage } from "./presenter";

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

type AgentId = "grammar_corrector" | "speaking_partner" | "english_evaluator";
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
    createInitialCoachSession({
      e2eDemo: E2E_DEMO,
      demoUnit: DEMO_UNIT,
      demoLesson: DEMO_LESSON,
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
  const [sessionTelemetry, setSessionTelemetry] = useState<CoachDiagnosticTelemetry[]>([]);
  const [resources, setResources] = useState<CoachResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState("");
  const [resourcesNotice, setResourcesNotice] = useState("");
  const [expandedResourceId, setExpandedResourceId] = useState<string | null>(null);
  const [grammarWorkbook, setGrammarWorkbook] = useState<CoachWorkbookContract | null>(null);
  const [grammarWorkbookLoading, setGrammarWorkbookLoading] = useState(false);
  const [grammarWorkbookError, setGrammarWorkbookError] = useState("");
  const [vocabularyWorkbook, setVocabularyWorkbook] = useState<CoachWorkbookContract | null>(null);
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
  const uiSession = resolveCoachUiSession({
    studyMode,
    currentUnit,
    currentLesson,
    studyUnit,
    studyClassNumber,
    coachSession,
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
  const diagnosticsPanelModel = toCoachDiagnosticsPanelModel({
    e2eDemo: E2E_DEMO,
    contextError,
    diagnosticsError,
    diagnosticsLoading,
    diagnosticChecks,
    sessionTelemetry,
  });
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
  const pageViewModel = presentCoachPage({
    authReady,
    signedIn,
    e2eDemo: E2E_DEMO,
    theme,
    textSize,
    hydrated,
    sidebarOpen,
    sidebarWidth,
    error,
    topBarModel,
    studyPanelModel,
    learningPulsePanelModel,
    diagnosticsPanelModel,
    guidesPanelModel,
    quickHelpPanelModel,
    classMaterialsPanelModel,
    messageListModel,
    composerModel,
  });
  const conversationStorageKey = getCoachConversationStorageKey(email);

  useEffect(() => {
    setHydrated(true);
    const preferences = loadCoachPreferences(window.localStorage, {
      isSmallViewport: window.matchMedia("(max-width: 640px)").matches,
    });
    if (preferences.theme) setTheme(preferences.theme);
    if (isCoachTextSize(preferences.textSize)) setTextSize(preferences.textSize);
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

      const contextSession = createContextLoadedSession({ data, getSavedPosition });
      const resolvedUnit = contextSession.unit ? normalizeUnitValue(contextSession.unit) : "";
      const lesson = contextSession.lesson;
      const classNumber = contextSession.classNumber;
      const progressSnapshot = buildProgressSnapshot(data);
      setCoachSession(contextSession.session);

      if (resolvedUnit) {
        setCurrentUnit(resolvedUnit);
        setStudyUnit(resolvedUnit);
      }
      setStudyClassNumber(classNumber);
      setStudyMode(contextSession.studyMode);
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
      const result = await runCoachDiagnostics({ api: coachApi });
      setDiagnosticChecks(result.checks);
      setSessionTelemetry(result.sessionTelemetry);
      setDiagnosticsError(result.error);
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function loadDriveUnitResources(unit: string) {
    setResourcesLoading(true);
    setResourcesError("");
    setResourcesNotice("");
    try {
      const result = await loadCoachResources({ api: coachApi, unit });
      setResources(result.resources);
      setResourcesNotice(result.notice);
      setResourcesError(result.error);
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
      const result = await createCoachWorkbook({
        api: coachApi,
        kind,
        unit,
        studyMode,
        currentLesson,
      });

      if (!result) return;

      if (isGrammar) setGrammarWorkbook(result.workbook);
      else setVocabularyWorkbook(result.workbook);

      window.open(result.openUrl, "_blank", "noopener,noreferrer");
      setMessages((current) => [...current, result.coachMessage]);
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
        currentSession: coachSession,
        getSavedPosition,
      });

      setStudyMode(next.studyMode);
      setCoachSession(next.session);
      if (next.studyUnit) {
        setStudyUnit(normalizeUnitValue(next.studyUnit));
      }
      setStudyClassNumber(next.studyClassNumber);
      if (next.currentLesson) setCurrentLesson(next.currentLesson);

      const activeInitialMessage = buildInitialCoachMessage(
        next.session.activeUnit || next.studyUnit || currentUnit || "tu posicion actual",
        next.session.lessonTitle || next.currentLesson || currentLesson,
        "",
        learnerName,
      );
      setMessages((current) => [...replaceInitialCoachGreeting(current, activeInitialMessage), next.coachMessage]);
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
    sendMessage(await buildStartTodayClassMessage(activeStudyUnit, studyMode === "current" ? currentLesson : ""));
  }

  async function requestUnitGrammar() {
    sendMessage(await buildUnitGrammarGuideMessage(activeStudyUnit));
  }

  async function requestUnitVocabulary() {
    sendMessage(await buildUnitVocabularyGuideMessage(activeStudyUnit));
  }

  async function requestHint() {
    sendMessage(await buildHintMessage(activeStudyUnit, studyMode === "current" ? currentLesson : ""));
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
    const result = await transcribeCoachDictation({ api: coachApi, audioBlob });
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!insertDictationText(result.text)) {
      setError("No pude convertir el audio en texto util. Intenta hablar mas claro y con menos ruido de fondo.");
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
    setCoachSession(createSelectedUnitSession({
      current: coachSession,
      unit,
      savedUnit: currentUnit,
      savedLesson: currentLesson,
    }));
  }

  function handleStudyUnitBlur(unit: string) {
    const normalizedUnit = normalizeUnitValue(unit);
    setStudyUnit(normalizedUnit);
    setCoachSession(createSelectedUnitSession({
      current: coachSession,
      unit: normalizedUnit,
      savedUnit: currentUnit,
      savedLesson: currentLesson,
    }));
  }

  function handleUseSavedPosition() {
    setStudyUnit(normalizeUnitValue(currentUnit));
    setStudyMode("current");
    setCoachSession(createSavedPositionSession({
      current: coachSession,
      savedUnit: currentUnit,
      savedLesson: currentLesson,
    }));
  }

  function handleRunAgent(agentId: string) {
    setActiveAgentId(agentId as AgentId);
    sendAgentMessage(undefined, agentId as AgentId);
  }

  function resizeSidebarFromClientX(clientX: number) {
    setSidebarWidth(resolveCoachSidebarWidthFromClientX({
      clientX,
      viewportWidth: window.innerWidth || 1280,
    }));
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

  const dispatch: CoachPageDispatch = (event) => {
    switch (event.type) {
      case "auth.signInRequested":
        return;
      case "layout.sidebarToggled":
        setSidebarOpen((open) => !open);
        return;
      case "layout.sidebarResizeStarted":
        startSidebarResize(event.clientX);
        return;
      case "layout.themeChanged":
        setTheme(event.theme);
        return;
      case "layout.textSizeChanged":
        setTextSize((size) => nextCoachTextSize(size, event.direction));
        return;
      case "study.unitChanged":
        handleStudyUnitChange(event.unit);
        return;
      case "study.unitCommitted":
        handleStudyUnitBlur(event.unit);
        return;
      case "study.savedPositionRequested":
        handleUseSavedPosition();
        return;
      case "study.classStartRequested":
        startTodayClass();
        return;
      case "guide.workbookCreateRequested":
        createWorkbook(event.kind);
        return;
      case "guide.chatGuideRequested":
        if (event.kind === "grammar") requestUnitGrammar();
        else requestUnitVocabulary();
        return;
      case "quickHelp.agentSelected":
        setActiveAgentId(event.agentId as AgentId);
        return;
      case "quickHelp.agentRunRequested":
        handleRunAgent(event.agentId);
        return;
      case "materials.resourceToggled":
        setExpandedResourceId((current) => current === event.resourceId ? null : event.resourceId);
        return;
      case "materials.resourcePracticeRequested":
        requestResourcePractice(event.resourceId);
        return;
      case "diagnostics.runRequested":
        runDiagnostics();
        return;
      case "composer.inputChanged":
        setInput(event.value);
        return;
      case "composer.imageSelected":
        handleImageSelected(event.file);
        return;
      case "composer.imageCleared":
        setSelectedImage(null);
        return;
      case "composer.dictationToggled":
        startDictation();
        return;
      case "composer.messageSubmitted":
        sendMessage();
        return;
      case "composer.thinkingStopped":
        stopThinking();
        return;
      case "message.speechToggled": {
        const message = messages[event.messageIndex];
        if (message) toggleSpeech(message.content, event.messageIndex);
        return;
      }
      case "message.speechStopOrRestartRequested": {
        const message = messages[event.messageIndex];
        if (!message) return;
        if (speakingMessageIndex === event.messageIndex) stopSpeech();
        else speakMessage(message.content, event.messageIndex);
        return;
      }
      case "message.feedbackToggled":
        toggleMessageFeedback(event.messageIndex, event.feedback);
        return;
      case "message.reportRequested": {
        const message = messages[event.messageIndex];
        if (message) reportMessage(message.content, event.messageIndex);
        return;
      }
      case "message.copyRequested": {
        const message = messages[event.messageIndex];
        if (message) copyMessage(message.content, event.messageIndex);
        return;
      }
    }
  };

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
    viewModel: pageViewModel,
    dispatch,
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
