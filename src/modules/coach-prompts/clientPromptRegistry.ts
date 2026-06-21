import { assertPromptVariables, renderPromptTemplate, type PromptVariables } from "./promptRenderer";

export type ClientPromptId =
  | "coach.startCurrentClass"
  | "coach.hint"
  | "coach.unitGrammarGuide"
  | "coach.unitVocabularyGuide"
  | "agents.grammarCorrector.default"
  | "agents.speakingPartner.default"
  | "agents.englishEvaluator.default";

const CLIENT_PROMPT_FILES: Record<ClientPromptId, string> = {
  "coach.startCurrentClass": "/prompts/coach/start-current-class.md",
  "coach.hint": "/prompts/coach/hint.md",
  "coach.unitGrammarGuide": "/prompts/coach/unit-grammar-guide.md",
  "coach.unitVocabularyGuide": "/prompts/coach/unit-vocabulary-guide.md",
  "agents.grammarCorrector.default": "/prompts/agents/grammar-corrector-default.md",
  "agents.speakingPartner.default": "/prompts/agents/speaking-partner-default.md",
  "agents.englishEvaluator.default": "/prompts/agents/english-evaluator-default.md",
};

const promptCache = new Map<ClientPromptId, string>();

export async function getClientPromptTemplate(id: ClientPromptId) {
  const cached = promptCache.get(id);
  if (cached !== undefined) return cached;

  const url = CLIENT_PROMPT_FILES[id];
  if (!url) throw new Error(`Unknown prompt id: ${id}`);

  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Unable to load prompt ${id}.`);

  const template = await response.text();
  promptCache.set(id, template);
  return template;
}

export async function renderClientPrompt(id: ClientPromptId, variables: PromptVariables = {}) {
  const template = await getClientPromptTemplate(id);
  assertPromptVariables(template, variables);
  return renderPromptTemplate(template, variables);
}
