import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("coach page clean-architecture boundary declares a single page view model", async () => {
  const source = readWorkspaceFile("src/modules/coach-page/pageViewModel.ts");

  expect(source).toContain("export type CoachPageViewModel");
  expect(source).toContain("authGate: CoachAuthGateViewModel");
  expect(source).toContain("shell: CoachShellViewModel");
  expect(source).toContain("topBar: CoachTopBarModel");
  expect(source).toContain("sidebar: CoachSidebarViewModel");
  expect(source).toContain("chat: CoachChatViewModel");
  expect(source).toContain("composer: CoachComposerModel");
  expect(source).toContain("globalError: CoachGlobalErrorViewModel");
});

test("coach page view model composes existing component view models instead of raw external payloads", async () => {
  const source = readWorkspaceFile("src/modules/coach-page/pageViewModel.ts");

  const requiredModels = [
    "CoachStudyPanelModel",
    "CoachLearningPulsePanelModel",
    "CoachDiagnosticsPanelModel",
    "CoachGuidesPanelModel",
    "CoachQuickHelpPanelModel",
    "CoachClassMaterialsPanelModel",
    "CoachMessageListModel",
    "CoachComposerModel",
  ];

  for (const model of requiredModels) {
    expect(source, model).toContain(model);
  }

  expect(source).not.toContain("context: any");
  expect(source).not.toContain("data: any");
  expect(source).not.toContain("payload: any");
});

test("coach page events define typed UI intents instead of component-specific callback names", async () => {
  const source = readWorkspaceFile("src/modules/coach-page/pageViewModel.ts");

  const requiredEvents = [
    "layout.sidebarToggled",
    "layout.themeChanged",
    "study.classStartRequested",
    "guide.workbookCreateRequested",
    "guide.chatGuideRequested",
    "quickHelp.agentRunRequested",
    "materials.resourcePracticeRequested",
    "diagnostics.runRequested",
    "composer.messageSubmitted",
    "composer.thinkingStopped",
    "message.feedbackToggled",
    "message.reportRequested",
  ];

  for (const eventType of requiredEvents) {
    expect(source, eventType).toContain(eventType);
  }

  expect(source).toContain("export type CoachPageDispatch");
});

