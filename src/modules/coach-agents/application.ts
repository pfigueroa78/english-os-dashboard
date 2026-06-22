export type AgentContractLike = {
  id: string;
  name: string;
};

export function prepareAgentMessageTurn(params: {
  customMessage?: string;
  input: string;
  defaultPrompt: string;
  agent: AgentContractLike;
  agentLoading: boolean;
}) {
  const message = (params.customMessage || params.input || params.defaultPrompt).trim();
  if (!message || params.agentLoading) return null;

  return {
    message,
    userMessage: {
      role: "user" as const,
      content: `[${params.agent.name}] ${message}`,
    },
    requestBody: {
      agentId: params.agent.id,
      message,
    },
  };
}

export function createDemoAgentTurn(agent: AgentContractLike, prepared: NonNullable<ReturnType<typeof prepareAgentMessageTurn>>) {
  return [
    prepared.userMessage,
    { role: "coach" as const, content: `${agent.name}\n\nModo demo: aquí aparecería la retroalimentación especializada.` },
  ];
}

export function createAgentCoachMessage(agent: AgentContractLike, data: any) {
  return {
    role: "coach" as const,
    content: `${data.agent?.name || agent.name}\n\n${data.reply || "No response returned."}`,
    usage: data.usage,
  };
}
