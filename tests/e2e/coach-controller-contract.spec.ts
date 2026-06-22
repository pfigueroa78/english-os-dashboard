import { expect, test } from "@playwright/test";
import {
  createAgentCoachMessage,
  createCoachErrorMessage,
  inferCoordinatesFromReply,
  prepareAgentMessageTurn,
  prepareCoachMessageTurn,
  resolveCoachResponseState,
  stripEphemeralImages,
} from "../../src/modules/coach-controller/coachController";

test("coach controller prepares learner turns without leaking ephemeral images into history", async () => {
  const prepared = prepareCoachMessageTurn({
    customMessage: undefined,
    input: "",
    selectedImage: { dataUrl: "data:image/jpeg;base64,abc", name: "desk.jpg", mimeType: "image/jpeg" },
    messages: [
      { role: "coach", content: "Hi" },
      { role: "user", content: "Old photo", image: { dataUrl: "data:image/jpeg;base64,old", name: "old.jpg" } },
    ],
    loading: false,
  });

  expect(prepared?.message).toContain("Analiza esta foto");
  expect(prepared?.userMessage.image?.name).toBe("desk.jpg");
  expect(prepared?.requestBody.image?.mimeType).toBe("image/jpeg");
  expect(JSON.stringify(prepared?.requestBody.conversationHistory)).not.toContain("data:image");
  expect(stripEphemeralImages([{ role: "user", content: "x", image: { dataUrl: "data:image/jpeg;base64,x" } }])[0].image).toBeUndefined();
});

test("coach controller resolves API responses into a session-oriented UI state", async () => {
  const resolved = resolveCoachResponseState({
    requestMessage: "Dame una guía de gramática de la unidad 4",
    data: {
      ok: true,
      reply: "Unit 4 — Early birds and night owls.\nClass: 2.",
      activeUnit: 4,
      activeClass: 2,
      usage: { totalTokens: 10 },
    },
    currentUnit: "Unit 1",
    currentLesson: "Old lesson",
    getSavedPosition: () => ({ unit: "Unit 1", lesson: "Saved lesson" }),
  });

  expect(resolved.studyMode).toBe("guide");
  expect(resolved.session.activeUnit).toBe("Unit 4");
  expect(resolved.session.resourcesUnit).toBe("Unit 4");
  expect(resolved.sessionEvents.map((event) => event.type)).toContain("session_transition_applied");
  expect(resolved.sessionEvents).toContainEqual({
    type: "resources_unit_resolved",
    unit: "Unit 4",
    policy: "follow-active-unit",
  });
  expect(resolved.studyClassNumber).toBeNull();
  expect(resolved.coachMessage.content).toContain("Unit 4");
  expect(inferCoordinatesFromReply("Unit 5.\nClass: 1.")).toEqual({ unit: 5, classNumber: 1 });
});

test("coach controller trusts API session over stale client current unit", async () => {
  const resolved = resolveCoachResponseState({
    requestMessage: "empieza con la clase",
    data: {
      ok: true,
      reply: "Encontré tu posición actual en English OS: Unit 4.\n\nUnit 4 — Early birds and night owls.\nClass: 28.",
      session: {
        mode: "class",
        savedUnit: "Unit 4",
        activeUnit: "Unit 4",
        activeClassNumber: 28,
        resourcesUnit: "Unit 4",
        lessonTitle: "Business advice speaking practice: expanding advice with contrast",
        source: "english_os",
      },
    },
    currentUnit: "Unit 1",
    currentLesson: "Stale lesson",
    getSavedPosition: () => ({ unit: "", lesson: "", classNumber: null }),
  });

  expect(resolved.session.activeUnit).toBe("Unit 4");
  expect(resolved.session.resourcesUnit).toBe("Unit 4");
  expect(resolved.studyUnit).toBe("Unit 4");
  expect(resolved.studyClassNumber).toBe(28);
});

test("agent controller prepares specialist requests and coach replies", async () => {
  const agent = { id: "grammar_corrector", name: "Corrector de gramática" };
  const prepared = prepareAgentMessageTurn({
    customMessage: "",
    input: "",
    defaultPrompt: "Correct this sentence.",
    agent,
    agentLoading: false,
  });

  expect(prepared?.requestBody).toEqual({ agentId: "grammar_corrector", message: "Correct this sentence." });
  expect(prepared?.userMessage.content).toContain("[Corrector de gramática]");
  expect(createAgentCoachMessage(agent, { reply: "Good effort.", usage: { totalTokens: 3 } }).content).toContain("Good effort.");
  expect(createCoachErrorMessage("timeout").content).toContain("Detalle: timeout");
});
