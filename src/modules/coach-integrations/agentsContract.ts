export type CoachAgentId = "grammar_corrector" | "speaking_partner" | "english_evaluator";

export type CoachAgentClientContract = {
  id: CoachAgentId;
  name: string;
  shortName: string;
  description: string;
  activity: string;
  defaultPrompt: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function agentId(value: unknown): CoachAgentId | null {
  const normalized = text(value);
  if (normalized === "grammar_corrector" || normalized === "speaking_partner" || normalized === "english_evaluator") {
    return normalized;
  }
  return null;
}

function fallbackShortName(id: CoachAgentId, name: string) {
  if (id === "grammar_corrector") return "Gramática";
  if (id === "speaking_partner") return "Speaking";
  if (id === "english_evaluator") return "Evaluar";
  return name;
}

export function toCoachAgentClientContract(value: any): CoachAgentClientContract | null {
  const id = agentId(value?.id);
  if (!id) return null;

  const name = text(value?.name) || fallbackShortName(id, "");
  return {
    id,
    name,
    shortName: text(value?.shortName) || fallbackShortName(id, name),
    description: text(value?.description),
    activity: text(value?.activity),
    defaultPrompt: text(value?.defaultPrompt),
  };
}

export function toCoachAgentClientContracts(values: unknown): CoachAgentClientContract[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(toCoachAgentClientContract)
    .filter((agent): agent is CoachAgentClientContract => Boolean(agent));
}
