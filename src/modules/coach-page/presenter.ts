import type { CoachComposerModel } from "@/modules/coach-chat/composerViewModel";
import type { CoachMessageListModel } from "@/modules/coach-chat/messageListViewModel";
import type { CoachTextSize, CoachTheme } from "@/modules/coach-layout/application";
import type {
  CoachClassMaterialsPanelModel,
  CoachDiagnosticsPanelModel,
  CoachGuidesPanelModel,
  CoachLearningPulsePanelModel,
  CoachQuickHelpPanelModel,
  CoachStudyPanelModel,
  CoachTopBarModel,
} from "@/modules/coach-session/viewModels";
import type {
  CoachAuthGateViewModel,
  CoachChatViewModel,
  CoachGlobalErrorViewModel,
  CoachPageViewModel,
  CoachShellViewModel,
  CoachSidebarViewModel,
} from "./pageViewModel";

export type PresentCoachAuthGateInput = {
  authReady: boolean;
  signedIn: boolean;
  e2eDemo: boolean;
};

export function presentCoachAuthGate(input: PresentCoachAuthGateInput): CoachAuthGateViewModel {
  if (!input.authReady && !input.e2eDemo) {
    return {
      state: "loading",
      title: "Loading English OS...",
    };
  }

  if (!input.signedIn) {
    return {
      state: "signed_out",
      title: "English OS Coach",
      description: "Sign in to continue your guided English learning path.",
      signInLabel: "Sign in",
    };
  }

  return { state: "signed_in" };
}

export function presentCoachShell(input: {
  theme: CoachTheme;
  textSize: CoachTextSize;
  hydrated: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
}): CoachShellViewModel {
  return {
    theme: input.theme,
    textSize: input.textSize,
    hydrated: input.hydrated,
    sidebar: {
      open: input.sidebarOpen,
      widthPx: input.sidebarWidth,
    },
  };
}

export function presentCoachSidebar(input: {
  sidebarOpen: boolean;
  studyPanelModel: CoachStudyPanelModel;
  learningPulsePanelModel: CoachLearningPulsePanelModel;
  diagnosticsPanelModel: CoachDiagnosticsPanelModel;
  guidesPanelModel: CoachGuidesPanelModel;
  quickHelpPanelModel: CoachQuickHelpPanelModel;
  classMaterialsPanelModel: CoachClassMaterialsPanelModel;
}): CoachSidebarViewModel {
  return {
    visible: input.sidebarOpen,
    study: input.studyPanelModel,
    learningPulse: input.learningPulsePanelModel,
    diagnostics: input.diagnosticsPanelModel,
    guides: input.guidesPanelModel,
    quickHelp: input.quickHelpPanelModel,
    materials: input.classMaterialsPanelModel,
  };
}

export function presentCoachChat(input: {
  messageListModel: CoachMessageListModel;
}): CoachChatViewModel {
  return {
    messages: input.messageListModel,
  };
}

export function presentCoachGlobalError(error: string): CoachGlobalErrorViewModel {
  return {
    visible: Boolean(error),
    message: error,
  };
}

export function presentCoachPage(input: {
  authReady: boolean;
  signedIn: boolean;
  e2eDemo: boolean;
  theme: CoachTheme;
  textSize: CoachTextSize;
  hydrated: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  error: string;
  topBarModel: CoachTopBarModel;
  studyPanelModel: CoachStudyPanelModel;
  learningPulsePanelModel: CoachLearningPulsePanelModel;
  diagnosticsPanelModel: CoachDiagnosticsPanelModel;
  guidesPanelModel: CoachGuidesPanelModel;
  quickHelpPanelModel: CoachQuickHelpPanelModel;
  classMaterialsPanelModel: CoachClassMaterialsPanelModel;
  messageListModel: CoachMessageListModel;
  composerModel: CoachComposerModel;
}): CoachPageViewModel {
  return {
    authGate: presentCoachAuthGate({
      authReady: input.authReady,
      signedIn: input.signedIn,
      e2eDemo: input.e2eDemo,
    }),
    shell: presentCoachShell({
      theme: input.theme,
      textSize: input.textSize,
      hydrated: input.hydrated,
      sidebarOpen: input.sidebarOpen,
      sidebarWidth: input.sidebarWidth,
    }),
    topBar: input.topBarModel,
    sidebar: presentCoachSidebar({
      sidebarOpen: input.sidebarOpen,
      studyPanelModel: input.studyPanelModel,
      learningPulsePanelModel: input.learningPulsePanelModel,
      diagnosticsPanelModel: input.diagnosticsPanelModel,
      guidesPanelModel: input.guidesPanelModel,
      quickHelpPanelModel: input.quickHelpPanelModel,
      classMaterialsPanelModel: input.classMaterialsPanelModel,
    }),
    chat: presentCoachChat({
      messageListModel: input.messageListModel,
    }),
    composer: input.composerModel,
    globalError: presentCoachGlobalError(input.error),
  };
}
