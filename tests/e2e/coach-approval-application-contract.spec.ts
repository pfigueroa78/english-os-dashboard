import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  buildClassApprovalRubric,
  canWriteClassApproval,
  evaluateClassApproval,
} from "../../src/modules/coach-approval/application";
import {
  courseStructureRepository,
  getApprovalPolicyConfig,
  getGrammarRuleSetConfig,
  getTargetMatcherSetConfig,
} from "../../src/modules/coach-config/pedagogyConfig";

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("class approval rubric is derived from active class contract instead of one hardcoded lesson", async () => {
  const unit5Class1 = {
    unit: 5,
    localClass: 1,
    lessonType: "Starting point + Reading + Vocabulary & Speaking",
    contract:
      "Active class target structures: It's polite to ask follow-up questions; gerund phrases; infinitive phrases; make conversation; describe polite and rude behavior",
  };

  const rubric = buildClassApprovalRubric(unit5Class1);

  expect(rubric.classId).toBe("unit-05-class-01");
  expect(rubric.lessonType).toContain("Vocabulary");
  expect(rubric.expectedProduction.join(" ")).toContain("polite");
  expect(rubric.requiresEvaluationGate).toBe(true);
});

test("class approval evaluation can approve non-business class evidence", async () => {
  const evaluation = evaluateClassApproval({
    classPack: {
      unit: 5,
      localClass: 1,
      lessonType: "Vocabulary & Speaking",
      contract:
        "Active class target structures: It's polite to ask follow-up questions; gerund phrases; infinitive phrases; describe polite and rude behavior",
    },
    answer:
      "It is polite to ask follow-up questions when you meet someone new. Ignoring your partner is rude because it stops the conversation.",
  });

  expect(evaluation.classId).toBe("unit-05-class-01");
  expect(evaluation.canApproveClass).toBe(true);
  expect(evaluation.score).toBeGreaterThanOrEqual(getApprovalPolicyConfig().passingScore);
  expect(evaluation.evaluatorVersion).toBeTruthy();
  expect(evaluation.policyId).toBe(getApprovalPolicyConfig().policyId);
  expect(evaluation.grammarApproved).toBe(true);
  expect(evaluation.vocabularyApproved).toBe(true);
  expect(evaluation.productionApproved).toBe(true);
  expect(canWriteClassApproval(evaluation)).toBe(true);
});

test("class approval blocks confirmation when evidence has blocking grammar errors", async () => {
  const evaluation = evaluateClassApproval({
    classPack: {
      unit: 2,
      localClass: 1,
      lessonType: "Grammar + Discussion",
      contract:
        "Active class target structures: should have + past participle; was supposed to + base verb; didn't have to + base verb; talk about past mistakes",
    },
    answer: "I should to studied more.",
  });

  expect(evaluation.canApproveClass).toBe(false);
  expect(evaluation.blockingErrors).toContain("Use should + base verb, not should to + verb.");
  expect(canWriteClassApproval(evaluation)).toBe(false);
});

test("generic Grammar Plus targets do not block a complete learner answer", async () => {
  const evaluation = evaluateClassApproval({
    classPack: {
      unit: 5,
      localClass: 6,
      globalClass: 34,
      lessonType: "Grammar Plus + Practice Lab",
      contract:
        "Active class grammar focus: Unit 5 Lesson B grammar consolidation from indexed Unit 5 context only\nActive class target structures: accurate forms from Unit 5\nActive class vocabulary focus: appropriate; polite; rude; conversation; follow-up questions\nExpected learner production: write two sentences using It depends on... and I'm not sure, but...",
    },
    answer:
      "It depends on the client, but I usually prefer clear and polite communication. I'm not sure, but I think asking follow-up questions is appropriate in a business conversation. Interrupting people is rude because it can make the conversation uncomfortable.",
  });

  expect(evaluation.canApproveClass).toBe(true);
  expect(evaluation.grammarApproved).toBe(true);
  expect(evaluation.vocabularyApproved).toBe(true);
  expect(evaluation.retryPrompt).not.toContain("ask the learner");
});

test("learner-facing retry prompt never exposes evaluator instructions", async () => {
  const evaluation = evaluateClassApproval({
    classPack: {
      unit: 5,
      localClass: 6,
      globalClass: 34,
      lessonType: "Grammar Plus + Practice Lab",
      contract:
        "Active class target structures: reported speech\nActive class vocabulary focus: claimed; promised; told me that",
    },
    answer: "Good.",
  });

  expect(evaluation.canApproveClass).toBe(false);
  expect(evaluation.retryPrompt).toContain("Please try again");
  expect(evaluation.retryPrompt).not.toContain("ask the learner");
  expect(evaluation.retryPrompt).not.toContain("Before approving");
});

test("v02 approval route does not contain Unit 4 business-advice hardcoded approval phrases", async () => {
  const source = readWorkspaceFile("src/app/api/english-os/v02/route.ts");

  expect(source).not.toContain("eligibleForApproval");
  expect(source).not.toContain("businessReasoning");
  expect(source).not.toContain("business priorities");
  expect(source).not.toContain("so everyone knows what to prioritize");
  expect(source).not.toContain("This would help the team recover");
  expect(source).toContain("canWriteClassApproval");
  expect(source).toContain("Class approval requires evaluated evidence");
});

test("approval thresholds and blocking grammar rules are loaded from configuration", async () => {
  const policy = getApprovalPolicyConfig();
  const grammarRules = getGrammarRuleSetConfig();

  expect(policy.policyId).toBe("default-class-approval");
  expect(policy.passingScore).toBe(8);
  expect(policy.responsePolicies.minimumSentencesByProductionType.checkpoint).toBeGreaterThan(1);
  expect(grammarRules.rules.map((rule) => rule.id)).toContain("modal-should-base-verb");

  const approvalSource = readWorkspaceFile("src/modules/coach-approval/application.ts");
  expect(approvalSource).toContain("getApprovalPolicyConfig");
  expect(approvalSource).toContain("getGrammarRuleSetConfig");
  expect(approvalSource).not.toContain("should\\s+to");
  expect(approvalSource).not.toContain("answer.length >=");
  expect(approvalSource).not.toContain("answer.split(/\\s+/).length >=");
});

test("course structure repository resolves next classes from configuration order", async () => {
  const repository = courseStructureRepository();

  expect(repository.nextClass(4, 7)).toEqual({ unit: 5, localClass: 1, globalClass: 29 });
  expect(repository.nextClass(12, 7)).toBeNull();
  expect(repository.isUnitCheckpoint(7)).toBe(true);
});

test("Apps Script class approval write requires evidence, rubric, score, gate and evaluator version", async () => {
  const source = readWorkspaceFile("apps-script/15_LearningState.js");

  expect(source).toContain("validateApprovalEvidence_");
  expect(source).toContain("'Approval Evidence'");
  expect(source).toContain("'Approval Rubric'");
  expect(source).toContain("'Approval Score'");
  expect(source).toContain("'Approval Gate Completed'");
  expect(source).toContain("'Approval Evaluator Version'");
  expect(source).toContain("'Approval Policy ID'");
  expect(source).toContain("approvalScore must be at least 8");
  expect(source).toContain("explicit classId is required");
  expect(source).toContain("policyId is required");
  expect(source).toContain("requestId is required");
  expect(source).toContain("canApproveClass must be true");
  expect(source).toContain("evaluationGateCompleted must be explicit");
  expect(source).toContain("blockingErrors must be empty");
  expect(source).not.toContain("Utilities.getUuid()).trim()");
  expect(source).not.toContain("|| 'true'");
});

test("approval persistence failures are not swallowed by coach route handler", async () => {
  const source = readWorkspaceFile("src/lib/coachRouteHandler.ts");

  expect(source).toContain("writeClassApprovalOrThrow");
  expect(source).toContain("Evaluation passed, but approval could not be saved yet.");
  expect(source).toContain("Class Approval Persistence Failed");
  expect(source).not.toMatch(/approveCurrentClassExercises[\s\S]{0,500}\.catch\(\(\)\s*=>\s*null\)/);
});

test("approval evaluator uses configured target matchers instead of pedagogical if-chains", async () => {
  const matcherConfig = getTargetMatcherSetConfig();
  const source = readWorkspaceFile("src/modules/coach-approval/application.ts");

  expect(matcherConfig.matcherSetId).toBe("default-target-matchers");
  expect(matcherConfig.evidenceMatchers.map((matcher) => matcher.id)).toContain("time-clauses");
  expect(source).toContain("getTargetMatcherSetConfig");
  expect(source).not.toContain("\\bgerund\\b/i.test(target)");
  expect(source).not.toContain("\\bsmall talk\\b");
  expect(source).not.toContain("\\b(time clauses?|before|after");
});

test("class progress module does not export text-driven advancement", async () => {
  const source = readWorkspaceFile("src/modules/coach-class-progress/application.ts");

  expect(source).not.toContain("export function advanceClassProgressFromReply");
  expect(source).not.toContain("function isMicroStepApproved");
  expect(source).not.toContain("This (?:learning block|micro-step) is approved");
});
