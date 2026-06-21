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
