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

export type CoachAuthGateViewModel =
  | {
      state: "loading";
      title: string;
    }
  | {
      state: "signed_out";
      title: string;
      description: string;
      signInLabel: string;
    }
  | {
      state: "signed_in";
    };

export type CoachGlobalErrorViewModel = {
  visible: boolean;
  message: string;
};

export type CoachShellViewModel = {
  theme: CoachTheme;
  textSize: CoachTextSize;
  hydrated: boolean;
  sidebar: {
    open: boolean;
    widthPx: number;
  };
};

export type CoachSidebarViewModel = {
  visible: boolean;
  study: CoachStudyPanelModel;
  learningPulse: CoachLearningPulsePanelModel;
  diagnostics: CoachDiagnosticsPanelModel;
  guides: CoachGuidesPanelModel;
  quickHelp: CoachQuickHelpPanelModel;
  materials: CoachClassMaterialsPanelModel;
};

export type CoachChatViewModel = {
  messages: CoachMessageListModel;
};

export type CoachPageViewModel = {
  authGate: CoachAuthGateViewModel;
  shell: CoachShellViewModel;
  topBar: CoachTopBarModel;
  sidebar: CoachSidebarViewModel;
  chat: CoachChatViewModel;
  composer: CoachComposerModel;
  globalError: CoachGlobalErrorViewModel;
};

export type CoachPageEvent =
  | { type: "auth.signInRequested" }
  | { type: "layout.sidebarToggled" }
  | { type: "layout.sidebarResizeStarted"; clientX: number }
  | { type: "layout.themeChanged"; theme: CoachTheme }
  | { type: "layout.textSizeChanged"; direction: -1 | 1 }
  | { type: "study.unitChanged"; unit: string }
  | { type: "study.unitCommitted"; unit: string }
  | { type: "study.savedPositionRequested" }
  | { type: "study.classStartRequested" }
  | { type: "guide.workbookCreateRequested"; kind: "grammar" | "vocabulary" }
  | { type: "guide.chatGuideRequested"; kind: "grammar" | "vocabulary" }
  | { type: "quickHelp.agentSelected"; agentId: string }
  | { type: "quickHelp.agentRunRequested"; agentId: string }
  | { type: "materials.resourceToggled"; resourceId: string }
  | { type: "materials.resourcePracticeRequested"; resourceId: string }
  | { type: "diagnostics.runRequested" }
  | { type: "composer.inputChanged"; value: string }
  | { type: "composer.imageSelected"; file?: File }
  | { type: "composer.imageCleared" }
  | { type: "composer.dictationToggled" }
  | { type: "composer.messageSubmitted" }
  | { type: "composer.thinkingStopped" }
  | { type: "message.speechToggled"; messageIndex: number }
  | { type: "message.speechStopOrRestartRequested"; messageIndex: number }
  | { type: "message.feedbackToggled"; messageIndex: number; feedback: "like" | "dislike" }
  | { type: "message.reportRequested"; messageIndex: number }
  | { type: "message.copyRequested"; messageIndex: number };

export type CoachPageDispatch = (event: CoachPageEvent) => void;
