import { expect, test } from "@playwright/test";
import {
  createAgentCoachMessage,
  createDemoAgentTurn,
  prepareAgentMessageTurn,
} from "../../src/modules/coach-agents/application";

const agent = { id: "grammar_corrector", name: "Corrector de gramática" };

test("coach agents application prepares specialist turns without component-side request rules", () => {
  const prepared = prepareAgentMessageTurn({
    customMessage: "",
    input: "",
    defaultPrompt: "Correct this sentence.",
    agent,
    agentLoading: false,
  });

  expect(prepared).toMatchObject({
    message: "Correct this sentence.",
    userMessage: {
      role: "user",
      content: "[Corrector de gramática] Correct this sentence.",
    },
    requestBody: {
      agentId: "grammar_corrector",
      message: "Correct this sentence.",
    },
  });
});

test("coach agents application blocks empty or duplicate specialist turns", () => {
  expect(prepareAgentMessageTurn({ customMessage: "", input: "", defaultPrompt: "", agent, agentLoading: false })).toBeNull();
  expect(prepareAgentMessageTurn({ customMessage: "Help", input: "", defaultPrompt: "", agent, agentLoading: true })).toBeNull();
});

test("coach agents application creates render-ready coach messages", () => {
  const prepared = prepareAgentMessageTurn({
    customMessage: "Check my sentence.",
    input: "",
    defaultPrompt: "",
    agent,
    agentLoading: false,
  });

  expect(prepared).not.toBeNull();
  const demoTurn = createDemoAgentTurn(agent, prepared!);
  expect(demoTurn[1].content).toContain("retroalimentación especializada");
  expect(createAgentCoachMessage(agent, { reply: "Good effort.", usage: { totalTokens: 3 } })).toMatchObject({
    role: "coach",
    content: "Corrector de gramática\n\nGood effort.",
    usage: { totalTokens: 3 },
  });
});
