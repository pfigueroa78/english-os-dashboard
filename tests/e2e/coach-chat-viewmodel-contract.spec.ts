import { test, expect } from "@playwright/test";
import { toCoachMessageListModel } from "../../src/modules/coach-chat/messageListViewModel";

test("coach message list view model exposes render-ready teacher actions", () => {
  const model = toCoachMessageListModel({
    messages: [
      { role: "user", content: "Hello", image: { dataUrl: "data:image/png;base64,abc", name: "desk.png" } },
      { role: "coach", content: "Teacher answer" },
    ],
    loading: false,
    agentLoading: false,
    activeAgentName: "Corrector de gramática",
    copiedMessageIndex: 1,
    messageFeedback: { 1: "like" },
    speakingMessageIndex: 1,
    speechPaused: false,
  });

  expect(model.messages[0]).toMatchObject({
    index: 0,
    role: "user",
    userLabel: "Tú —",
    image: { alt: "desk.png" },
  });
  expect(model.messages[1]).toMatchObject({
    index: 1,
    role: "coach",
    teacherLabel: "Profesor dijo:",
    speechAction: { icon: "pause", ariaLabel: "Pausar lectura", title: "Pausar" },
    stopOrRestartAction: { icon: "stop", ariaLabel: "Detener lectura" },
    likeAction: { pressed: true, ariaLabel: "Quitar me gusta" },
    dislikeAction: { pressed: false, ariaLabel: "Marcar respuesta como no útil" },
    copyAction: { icon: "check", title: "Copiado" },
  });
});

test("coach message list view model exposes thinking state without component-side branching", () => {
  expect(
    toCoachMessageListModel({
      messages: [],
      loading: false,
      agentLoading: true,
      activeAgentName: "Speaking",
      copiedMessageIndex: null,
      messageFeedback: {},
      speakingMessageIndex: null,
      speechPaused: false,
    }).thinking,
  ).toEqual({ visible: true, label: "Speaking está pensando" });

  expect(
    toCoachMessageListModel({
      messages: [],
      loading: true,
      agentLoading: false,
      activeAgentName: "Speaking",
      copiedMessageIndex: null,
      messageFeedback: {},
      speakingMessageIndex: null,
      speechPaused: false,
    }).thinking,
  ).toEqual({ visible: true, label: "El profesor está pensando" });
});
