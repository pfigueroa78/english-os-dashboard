import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertPromptVariables, renderPromptTemplate, type PromptVariables } from "./promptRenderer";

export type ServerPromptId =
  | "agents.grammarCorrector.system"
  | "agents.speakingPartner.system"
  | "agents.englishEvaluator.system"
  | "agents.grammarCorrector.default"
  | "agents.speakingPartner.default"
  | "agents.englishEvaluator.default"
  | "agents.contextMessage"
  | "coachRoute.class.system"
  | "coachRoute.class.user"
  | "coachRoute.general.system"
  | "coachRoute.general.user"
  | "coachRoute.review.system"
  | "coachRoute.review.user"
  | "coachRoute.visualVocabulary.system"
  | "coachRoute.visualVocabulary.user"
  | "coachRoute.unitGuide.system"
  | "coachRoute.unitGuide.user";

const SERVER_PROMPT_FILES: Record<ServerPromptId, string> = {
  "agents.grammarCorrector.system": "agents/grammar-corrector-system.md",
  "agents.speakingPartner.system": "agents/speaking-partner-system.md",
  "agents.englishEvaluator.system": "agents/english-evaluator-system.md",
  "agents.grammarCorrector.default": "agents/grammar-corrector-default.md",
  "agents.speakingPartner.default": "agents/speaking-partner-default.md",
  "agents.englishEvaluator.default": "agents/english-evaluator-default.md",
  "agents.contextMessage": "agents/context-message.md",
  "coachRoute.class.system": "coach-route/class-system.md",
  "coachRoute.class.user": "coach-route/class-user.md",
  "coachRoute.general.system": "coach-route/general-system.md",
  "coachRoute.general.user": "coach-route/general-user.md",
  "coachRoute.review.system": "coach-route/review-system.md",
  "coachRoute.review.user": "coach-route/review-user.md",
  "coachRoute.visualVocabulary.system": "coach-route/visual-vocabulary-system.md",
  "coachRoute.visualVocabulary.user": "coach-route/visual-vocabulary-user.md",
  "coachRoute.unitGuide.system": "coach-route/unit-guide-system.md",
  "coachRoute.unitGuide.user": "coach-route/unit-guide-user.md",
};

const promptCache = new Map<ServerPromptId, string>();

export async function getServerPromptTemplate(id: ServerPromptId) {
  const cached = promptCache.get(id);
  if (cached !== undefined) return cached;

  const relativePath = SERVER_PROMPT_FILES[id];
  if (!relativePath) throw new Error(`Unknown prompt id: ${id}`);

  const template = await readFile(path.join(process.cwd(), "public", "prompts", relativePath), "utf8");
  promptCache.set(id, template);
  return template;
}

export async function renderServerPrompt(id: ServerPromptId, variables: PromptVariables = {}) {
  const template = await getServerPromptTemplate(id);
  assertPromptVariables(template, variables);
  return renderPromptTemplate(template, variables);
}
