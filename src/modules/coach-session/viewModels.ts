import type { CoachSessionState } from "./types";
import { sessionHeaderDetail, sessionLocationLabel, sessionModeLabel, sessionResourcesLabel } from "./selectors";

export type CoachTopBarModel = {
  modeLabel: string;
  locationLabel: string;
  progressLabel: string;
  detailLabel: string;
};

export type CoachStudyPanelModel = {
  title: string;
  modeLabel: string;
  savedPositionLabel: string;
  resourcesLabel: string;
  studyUnitValue: string;
  studyUnitPlaceholder: string;
  canUseSavedPosition: boolean;
  canStartClass: boolean;
};

export type CoachLearningPulsePanelModel = {
  level: string;
  evidenceLabel: string;
  practiceCount: number;
  focus: string;
  nextStep: string;
};

export type CoachWorkbookModel = {
  title: string;
  fileUrl: string;
  exportUrl: string;
} | null;

export type CoachGuideActionModel = {
  buttonLabel: string;
  loading: boolean;
  error: string;
  workbook: CoachWorkbookModel;
};

export type CoachGuidesPanelModel = {
  unitLabel: string;
  canUseWorkbookActions: boolean;
  chatActionsDisabled: boolean;
  grammar: CoachGuideActionModel;
  vocabulary: CoachGuideActionModel;
};

export type CoachQuickHelpAgentModel = {
  id: string;
  name: string;
  shortName: string;
};

export type CoachQuickHelpPanelModel = {
  agents: CoachQuickHelpAgentModel[];
  activeAgentId: string;
  activeAgentDescription: string;
  loading: boolean;
  error: string;
};

export type CoachClassMaterialModel = {
  id: string;
  title: string;
  description: string;
  type: "audio" | "video" | "document" | "link";
  url: string;
  embedUrl: string | null;
};

export type CoachClassMaterialsPanelModel = {
  unitLabel: string;
  resources: CoachClassMaterialModel[];
  loading: boolean;
  notice: string;
  error: string;
  expandedResourceId: string | null;
  practiceDisabled: boolean;
};

type StudyPanelModelInput = {
  session: CoachSessionState;
  currentUnitLabel: string;
  contextLoading: boolean;
  studyUnitValue: string;
  loading: boolean;
};

export function toCoachTopBarModel(session: CoachSessionState, progressLabel: string): CoachTopBarModel {
  return {
    modeLabel: sessionModeLabel(session.mode),
    locationLabel: sessionLocationLabel(session),
    progressLabel,
    detailLabel: sessionHeaderDetail(session),
  };
}

export function toCoachStudyPanelModel({
  session,
  currentUnitLabel,
  contextLoading,
  studyUnitValue,
  loading,
}: StudyPanelModelInput): CoachStudyPanelModel {
  return {
    title: sessionLocationLabel(session),
    modeLabel: sessionModeLabel(session.mode),
    savedPositionLabel: contextLoading ? "Cargando…" : currentUnitLabel,
    resourcesLabel: sessionResourcesLabel(session),
    studyUnitValue,
    studyUnitPlaceholder: currentUnitLabel,
    canUseSavedPosition: Boolean(currentUnitLabel),
    canStartClass: !loading && Boolean(studyUnitValue),
  };
}

export function toCoachLearningPulsePanelModel(input: {
  level: string;
  evidenceLabel: string;
  practiceCount: number;
  focus: string;
  nextStep: string;
}): CoachLearningPulsePanelModel {
  return {
    level: input.level,
    evidenceLabel: input.evidenceLabel,
    practiceCount: input.practiceCount,
    focus: input.focus,
    nextStep: input.nextStep,
  };
}

export function toCoachGuidesPanelModel(input: {
  unitLabel: string;
  canUseWorkbookActions: boolean;
  chatActionsDisabled: boolean;
  grammarWorkbookLoading: boolean;
  vocabularyWorkbookLoading: boolean;
  grammarWorkbookError: string;
  vocabularyWorkbookError: string;
  grammarWorkbook: CoachWorkbookModel;
  vocabularyWorkbook: CoachWorkbookModel;
}): CoachGuidesPanelModel {
  return {
    unitLabel: input.unitLabel,
    canUseWorkbookActions: input.canUseWorkbookActions,
    chatActionsDisabled: input.chatActionsDisabled,
    grammar: {
      buttonLabel: input.grammarWorkbookLoading ? "Generando..." : `Guía de gramática · ${input.unitLabel}`,
      loading: input.grammarWorkbookLoading,
      error: input.grammarWorkbookError,
      workbook: input.grammarWorkbook,
    },
    vocabulary: {
      buttonLabel: input.vocabularyWorkbookLoading ? "Generando..." : `Guía de vocabulario · ${input.unitLabel}`,
      loading: input.vocabularyWorkbookLoading,
      error: input.vocabularyWorkbookError,
      workbook: input.vocabularyWorkbook,
    },
  };
}

export function toCoachQuickHelpPanelModel(input: {
  agents: Array<{ id: string; name: string; shortName: string }>;
  activeAgentId: string;
  activeAgentDescription: string;
  loading: boolean;
  error: string;
}): CoachQuickHelpPanelModel {
  return {
    agents: input.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      shortName: agent.shortName,
    })),
    activeAgentId: input.activeAgentId,
    activeAgentDescription: input.activeAgentDescription,
    loading: input.loading,
    error: input.error,
  };
}

export function toCoachClassMaterialsPanelModel(input: {
  unitLabel: string;
  resources: Array<{
    resourceId: string;
    title: string;
    description: string;
    type: "audio" | "video" | "document" | "link";
    url: string;
    embedUrl?: string | null;
  }>;
  resourcesLoading: boolean;
  resourcesNotice: string;
  resourcesError: string;
  expandedResourceId: string | null;
  practiceDisabled: boolean;
}): CoachClassMaterialsPanelModel {
  return {
    unitLabel: input.unitLabel,
    resources: input.resources.map((resource) => ({
      id: resource.resourceId,
      title: resource.title,
      description: resource.description,
      type: resource.type,
      url: resource.url,
      embedUrl: resource.embedUrl || null,
    })),
    loading: input.resourcesLoading,
    notice: input.resourcesNotice,
    error: input.resourcesError,
    expandedResourceId: input.expandedResourceId,
    practiceDisabled: input.practiceDisabled,
  };
}
