import { CoachClassMaterialsPanel } from "@/modules/coach-resources/CoachClassMaterialsPanel";
import { CoachDiagnosticsPanel } from "@/modules/coach-resources/CoachDiagnosticsPanel";
import { CoachGuidesPanel } from "@/modules/coach-resources/CoachGuidesPanel";
import { CoachLearningPulsePanel } from "@/modules/coach-resources/CoachLearningPulsePanel";
import { CoachQuickHelpPanel } from "@/modules/coach-resources/CoachQuickHelpPanel";
import { CoachStudyPanel } from "@/modules/coach-resources/CoachStudyPanel";
import type { CoachPageDispatch, CoachSidebarViewModel } from "./pageViewModel";

type CoachSidebarViewProps = {
  viewModel: CoachSidebarViewModel;
  dispatch: CoachPageDispatch;
};

export function CoachSidebarView({ viewModel, dispatch }: CoachSidebarViewProps) {
  if (!viewModel.visible) return null;

  return (
    <aside id="coach-sidebar" className="coach-sidebar min-w-0 max-w-full space-y-2 overflow-x-hidden">
      <CoachStudyPanel
        model={viewModel.study}
        onStudyUnitChange={(unit) => dispatch({ type: "study.unitChanged", unit })}
        onStudyUnitBlur={(unit) => dispatch({ type: "study.unitCommitted", unit })}
        onUseSavedPosition={() => dispatch({ type: "study.savedPositionRequested" })}
        onStartClass={() => dispatch({ type: "study.classStartRequested" })}
      />

      <CoachLearningPulsePanel model={viewModel.learningPulse} />

      <CoachDiagnosticsPanel
        model={viewModel.diagnostics}
        onRunDiagnostics={() => dispatch({ type: "diagnostics.runRequested" })}
      />

      <CoachGuidesPanel
        model={viewModel.guides}
        onCreateGrammarWorkbook={() => dispatch({ type: "guide.workbookCreateRequested", kind: "grammar" })}
        onCreateVocabularyWorkbook={() => dispatch({ type: "guide.workbookCreateRequested", kind: "vocabulary" })}
        onRequestGrammarGuide={() => dispatch({ type: "guide.chatGuideRequested", kind: "grammar" })}
        onRequestVocabularyGuide={() => dispatch({ type: "guide.chatGuideRequested", kind: "vocabulary" })}
      />

      <CoachQuickHelpPanel
        model={viewModel.quickHelp}
        onSelectAgent={(agentId) => dispatch({ type: "quickHelp.agentSelected", agentId })}
        onRunAgent={(agentId) => dispatch({ type: "quickHelp.agentRunRequested", agentId })}
      />

      <CoachClassMaterialsPanel
        model={viewModel.materials}
        onToggleResource={(resourceId) => dispatch({ type: "materials.resourceToggled", resourceId })}
        onPracticeResource={(resourceId) => dispatch({ type: "materials.resourcePracticeRequested", resourceId })}
      />
    </aside>
  );
}
