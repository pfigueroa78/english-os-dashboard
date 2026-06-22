export {
  coachModeFromStudyMode,
  createCoachErrorMessage,
  createDemoCoachTurn,
  inferCoordinatesFromReply,
  isGuideRequest,
  isReviewRequest,
  prepareCoachMessageTurn,
  resolveCoachResponseState,
  stripEphemeralImages,
  type CoachControllerMessage,
  type CoachImagePayload,
  type CoachStudyMode,
} from "@/modules/coach-message/application";

export {
  createAgentCoachMessage,
  createDemoAgentTurn,
  prepareAgentMessageTurn,
  type AgentContractLike,
} from "@/modules/coach-agents/application";
