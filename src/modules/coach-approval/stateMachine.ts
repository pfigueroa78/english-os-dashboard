import { canWriteClassApproval, ClassApprovalEvaluation } from "./application";

export type ClassApprovalState =
  | "class_opened"
  | "practice_requested"
  | "learner_answer_received"
  | "answer_evaluated"
  | "evaluation_gate_sent"
  | "evaluation_gate_completed"
  | "class_approval_ready"
  | "class_approved"
  | "class_closed";

export type ClassApprovalEvent =
  | "CLASS_OPENED"
  | "PRACTICE_REQUESTED"
  | "LEARNER_ANSWER_RECEIVED"
  | "ANSWER_EVALUATED"
  | "EVALUATION_GATE_SENT"
  | "EVALUATION_GATE_COMPLETED"
  | "APPROVAL_WRITE_SUCCEEDED"
  | "CLASS_CLOSED";

export type ClassApprovalTransition = {
  from: ClassApprovalState;
  event: ClassApprovalEvent;
  to: ClassApprovalState;
};

export type ApprovalFlowDecision = {
  canCallApprovalTool: boolean;
  shouldAskMorePractice: boolean;
  mustCloseClass: boolean;
  teacherInstruction: string;
  nextState: ClassApprovalState;
};

const TRANSITIONS: Record<ClassApprovalState, Partial<Record<ClassApprovalEvent, ClassApprovalState>>> = {
  class_opened: {
    PRACTICE_REQUESTED: "practice_requested",
    EVALUATION_GATE_SENT: "evaluation_gate_sent",
  },
  practice_requested: {
    LEARNER_ANSWER_RECEIVED: "learner_answer_received",
  },
  learner_answer_received: {
    ANSWER_EVALUATED: "answer_evaluated",
  },
  answer_evaluated: {
    PRACTICE_REQUESTED: "practice_requested",
    EVALUATION_GATE_SENT: "evaluation_gate_sent",
    EVALUATION_GATE_COMPLETED: "evaluation_gate_completed",
  },
  evaluation_gate_sent: {
    LEARNER_ANSWER_RECEIVED: "learner_answer_received",
    EVALUATION_GATE_COMPLETED: "evaluation_gate_completed",
  },
  evaluation_gate_completed: {
    ANSWER_EVALUATED: "answer_evaluated",
    APPROVAL_WRITE_SUCCEEDED: "class_approved",
  },
  class_approval_ready: {
    APPROVAL_WRITE_SUCCEEDED: "class_approved",
  },
  class_approved: {
    CLASS_CLOSED: "class_closed",
  },
  class_closed: {},
};

export function nextClassApprovalState(
  current: ClassApprovalState,
  event: ClassApprovalEvent
): ClassApprovalTransition {
  const to = TRANSITIONS[current][event] || current;
  return { from: current, event, to };
}

export function resolveApprovalFlowDecision(params: {
  state: ClassApprovalState;
  evaluation?: ClassApprovalEvaluation | null;
}): ApprovalFlowDecision {
  const { state, evaluation } = params;
  const retryPrompt = evaluation?.retryPrompt;

  if (state === "class_approved" || state === "class_closed") {
    return {
      canCallApprovalTool: false,
      shouldAskMorePractice: false,
      mustCloseClass: true,
      nextState: state === "class_approved" ? "class_closed" : "class_closed",
      teacherInstruction:
        "The class is already approved. Do not ask more practice for the same class; close the class and offer the next learning action.",
    };
  }

  if (evaluation && canWriteClassApproval(evaluation)) {
    return {
      canCallApprovalTool: true,
      shouldAskMorePractice: false,
      mustCloseClass: false,
      nextState: "class_approval_ready",
      teacherInstruction:
        "The learner has met the class rubric. Call the approval tool with the evaluated evidence, then close the class after the write succeeds.",
    };
  }

  return {
    canCallApprovalTool: false,
    shouldAskMorePractice: true,
    mustCloseClass: false,
    nextState: state,
    teacherInstruction:
      retryPrompt ||
      "Continue with targeted practice. Do not approve until the evaluation gate and class rubric are satisfied.",
  };
}
