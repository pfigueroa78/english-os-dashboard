import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  buildClassApprovalRubric,
  canWriteClassApproval,
  evaluateClassApproval,
} from "../../src/modules/coach-approval/application";

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
