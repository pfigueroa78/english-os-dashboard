import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { presentCoachAuthGate, presentCoachPage } from "../../src/modules/coach-page/presenter";
import type { CoachPageViewModel } from "../../src/modules/coach-page/pageViewModel";

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function samplePageInput() {
  return {
    authReady: true,
    signedIn: true,
    e2eDemo: false,
    theme: "paper" as const,
    textSize: "compact" as const,
    hydrated: true,
    sidebarOpen: true,
    sidebarWidth: 340,
    error: "",
    topBarModel: {
      modeLabel: "Clase",
      locationLabel: "Unit 4 · Class 28",
      progressLabel: "3/4",
      detailLabel: "English OS",
    },
    studyPanelModel: {
      title: "Unit 4 · Class 28",
      modeLabel: "Clase",
      savedPositionLabel: "Unit 4",
      resourcesLabel: "Unit 4",
      studyUnitValue: "Unit 4",
      studyUnitPlaceholder: "Unit 4",
      canUseSavedPosition: true,
      canStartClass: true,
    },
    learningPulsePanelModel: {
      level: "B1+",
      evidenceLabel: "3/4",
      practiceCount: 5,
      focus: "responder con más evidencia",
      nextStep: "producir una respuesta breve",
    },
    diagnosticsPanelModel: {
      visible: true,
      loading: false,
      error: "",
      checks: [],
      sessionTelemetry: [],
    },
    guidesPanelModel: {
      unitLabel: "Unit 4",
      canUseWorkbookActions: true,
      chatActionsDisabled: false,
      grammar: { buttonLabel: "Guía de gramática", loading: false, error: "", workbook: null },
      vocabulary: { buttonLabel: "Guía de vocabulario", loading: false, error: "", workbook: null },
    },
    quickHelpPanelModel: {
      agents: [{ id: "grammar_corrector", name: "Corrector", shortName: "Gramática" }],
      activeAgentId: "grammar_corrector",
      activeAgentDescription: "Corrige estructura.",
      loading: false,
      error: "",
    },
    classMaterialsPanelModel: {
      unitLabel: "Unit 4",
      resources: [],
      loading: false,
      notice: "",
      error: "",
      expandedResourceId: null,
      practiceDisabled: false,
    },
    messageListModel: {
      messages: [],
      thinking: { visible: false, label: "El profesor está pensando" },
    },
    composerModel: {
      input: "",
      selectedImage: null,
      fileInput: { accept: "image/*" },
      textarea: { disabled: false, placeholder: "Escribe..." },
      imageButton: { disabled: false, ariaLabel: "Agregar foto", title: "Agregar foto", className: "button" },
      microphoneButton: { disabled: false, ariaLabel: "Micrófono", title: "Micrófono", icon: "mic" as const, className: "button" },
      sendButton: { disabled: true, ariaLabel: "Enviar", title: "Enviar", icon: "send" as const, className: "button" },
    },
  };
}

test("coach page presenter composes a full CoachPageViewModel", async () => {
  const viewModel: CoachPageViewModel = presentCoachPage(samplePageInput());

  expect(viewModel.authGate).toEqual({ state: "signed_in" });
  expect(viewModel.shell).toMatchObject({
    theme: "paper",
    textSize: "compact",
    hydrated: true,
    sidebar: { open: true, widthPx: 340 },
  });
  expect(viewModel.sidebar.visible).toBe(true);
  expect(viewModel.sidebar.study.title).toBe("Unit 4 · Class 28");
  expect(viewModel.chat.messages.messages).toEqual([]);
  expect(viewModel.composer.fileInput.accept).toBe("image/*");
  expect(viewModel.globalError).toEqual({ visible: false, message: "" });
});

test("coach page presenter handles auth gate and global error without React dependencies", async () => {
  expect(presentCoachAuthGate({ authReady: false, signedIn: false, e2eDemo: false })).toMatchObject({
    state: "loading",
  });
  expect(presentCoachAuthGate({ authReady: true, signedIn: false, e2eDemo: false })).toMatchObject({
    state: "signed_out",
    signInLabel: "Sign in",
  });

  const viewModel = presentCoachPage({
    ...samplePageInput(),
    error: "Something failed",
    sidebarOpen: false,
  });

  expect(viewModel.sidebar.visible).toBe(false);
  expect(viewModel.globalError).toEqual({ visible: true, message: "Something failed" });
});

test("coach page presenter stays framework-free and is the only page model assembler", async () => {
  const source = readWorkspaceFile("src/modules/coach-page/presenter.ts");

  expect(source).toContain("export function presentCoachPage");
  expect(source).toContain("presentCoachAuthGate");
  expect(source).toContain("presentCoachShell");
  expect(source).toContain("presentCoachSidebar");
  expect(source).toContain("presentCoachChat");
  expect(source).toContain("presentCoachGlobalError");
  expect(source).not.toContain("useState");
  expect(source).not.toContain("useEffect");
  expect(source).not.toContain("@clerk");
  expect(source).not.toContain("fetch(");
  expect(source).not.toContain("window.");
  expect(source).not.toContain("document.");
});

test("coach page controller exposes the assembled page view model without replacing existing slices yet", async () => {
  const source = readWorkspaceFile("src/modules/coach-page/useCoachPageController.ts");

  expect(source).toContain("type { CoachPageDispatch }");
  expect(source).toContain('import { presentCoachPage } from "./presenter"');
  expect(source).toContain("const pageViewModel = presentCoachPage({");
  expect(source).toContain("viewModel: pageViewModel");
  expect(source).toContain("dispatch,");
  expect(source).toContain("models: {");
});

test("coach page is a thin composition root over CoachPageView", async () => {
  const source = readWorkspaceFile("src/app/coach/page.tsx");

  expect(source).toContain("CoachPageView");
  expect(source).toContain("useCoachPageController");
  expect(source).toContain("viewModel={viewModel}");
  expect(source).toContain("dispatch={dispatch}");
  expect(source).toContain("renderSignInButton");
  expect(source).not.toContain("models.");
  expect(source).not.toContain("actions.");
  expect(source).not.toContain("state.");
});

test("coach page views adapt view model slices to existing component APIs", async () => {
  const pageView = readWorkspaceFile("src/modules/coach-page/CoachPageView.tsx");
  const sidebarView = readWorkspaceFile("src/modules/coach-page/CoachSidebarView.tsx");
  const chatView = readWorkspaceFile("src/modules/coach-page/CoachChatView.tsx");

  expect(pageView).toContain("viewModel.authGate.state");
  expect(pageView).toContain("viewModel.topBar");
  expect(pageView).toContain("CoachSidebarView viewModel={viewModel.sidebar}");
  expect(pageView).toContain("CoachChatView viewModel={viewModel.chat}");
  expect(pageView).toContain('dispatch({ type: "layout.sidebarToggled" })');
  expect(sidebarView).toContain('dispatch({ type: "study.classStartRequested" })');
  expect(sidebarView).toContain('dispatch({ type: "guide.chatGuideRequested"');
  expect(chatView).toContain('dispatch({ type: "composer.messageSubmitted" })');
  expect(chatView).toContain('dispatch({ type: "message.feedbackToggled"');
});
