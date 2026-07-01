import { buildInitialCoachMessages } from "@/modules/coach-context/coachContext";
import { toCoachAgentClientContracts } from "@/modules/coach-integrations/agentsContract";
import type { CoachStudyMode } from "@/modules/coach-message/application";
import type { ClientPromptId } from "@/modules/coach-prompts/clientPromptRegistry";

export type CoachPageMessage = {
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

export type AgentId = "grammar_corrector" | "speaking_partner" | "english_evaluator";
export type StudyMode = CoachStudyMode;

export type SpecialistAgent = {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  defaultPromptId: ClientPromptId;
};

export const E2E_DEMO = process.env.NEXT_PUBLIC_E2E_DEMO === "1";
export const DEMO_UNIT = "Unit 1";
export const DEMO_LESSON = "Business advice speaking practice";
export const DEMO_LEARNER_NAME = "Demo learner";
export const DEMO_LEARNER_EMAIL = "demo-learner";
export const COACH_REPORT_RECIPIENT_EMAIL = process.env.NEXT_PUBLIC_ENGLISH_OS_SUPPORT_EMAIL || "";

export const SPECIALIST_AGENTS: SpecialistAgent[] = [
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

export const SPECIALIST_AGENT_CONTRACTS = toCoachAgentClientContracts(SPECIALIST_AGENTS);

export function initialCoachMessages(): CoachPageMessage[] {
  return buildInitialCoachMessages({
    e2eDemo: E2E_DEMO,
    demoUnit: DEMO_UNIT,
    demoLesson: DEMO_LESSON,
    demoLearnerName: DEMO_LEARNER_NAME,
  });
}

export function replaceInitialCoachGreeting(messages: CoachPageMessage[], freshInitialMessage: string) {
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

export function studyModeLabel(mode: StudyMode) {
  if (mode === "review") return "Repaso";
  if (mode === "guide") return "Guia";
  if (mode === "class") return "Clase";
  return "Actual";
}
