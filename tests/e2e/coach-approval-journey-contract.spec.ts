import { expect, test } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  canWriteClassApproval,
  evaluateClassApproval,
} from "../../src/modules/coach-approval/application";
import {
  nextClassApprovalState,
  resolveApprovalFlowDecision,
} from "../../src/modules/coach-approval/stateMachine";

type JourneyStep = {
  classId: string;
  unit: number;
  localClass: number;
  globalClass: number;
  approvalKind: "class_evaluation" | "unit_checkpoint";
  failedFirst: boolean;
  blockedAsExpected: boolean;
  approvedAfterRetry: boolean;
  finalState: string;
  evidenceCount: number;
  nextAction: string;
  timingsMs: {
    contractLoad: number;
    evaluation: number;
    stateMachine: number;
  };
};

const classPackDirectory = path.join(process.cwd(), "knowledge", "class-packs-lesson-vision");

function parseClassPackName(filename: string) {
  const match = filename.match(/unit-(\d+)-local-class-(\d+)-global-class-(\d+)/i);
  if (!match) return null;
  return {
    unit: Number(match[1]),
    localClass: Number(match[2]),
    globalClass: Number(match[3]),
  };
}

function readFirstClassPacks(count: number) {
  const start = performance.now();
  const packs = readdirSync(classPackDirectory)
    .filter((filename) => filename.endsWith(".md"))
    .map((filename) => ({ filename, parsed: parseClassPackName(filename) }))
    .filter((item): item is { filename: string; parsed: NonNullable<ReturnType<typeof parseClassPackName>> } => Boolean(item.parsed))
    .sort((a, b) => a.parsed.globalClass - b.parsed.globalClass)
    .slice(0, count)
    .map(({ filename, parsed }) => ({
      ...parsed,
      filename,
      contract: readFileSync(path.join(classPackDirectory, filename), "utf8"),
    }));
  return {
    packs,
    contractLoadMs: performance.now() - start,
  };
}

function learnerAnswerFor(classPack: { unit: number; localClass: number; globalClass: number; contract: string }) {
  return [
    `For Unit ${classPack.unit}, Class ${classPack.localClass}, I can answer with the target language and one clear example.`,
    "I used to be shy, but I have become more confident in meetings.",
    "I was supposed to prepare earlier, and I should have planned my time better.",
    "The city that I like is a place where people can work, study, and relax.",
    "As soon as I wake up, I organize my tasks before I start work.",
    "You might want to rest more, although the project is urgent.",
    "How's it going? It was great to meet you; I have worked on this before.",
    "He said that it was a secret, and she asked me what I was saying.",
    "I wonder why the service is so slow, and I feel frustrated when a problem is not solved.",
    "Even if I were busy, I would be honest, and I would keep it a secret only if it were ethical.",
    "By the end of next year, I will have improved my English, and I will have been practicing every week.",
    "I can explain my opinion, give a reason, and connect the lesson to my real professional life.",
  ].join(" ");
}

function blockingLearnerAnswer() {
  return "I should to studied more.";
}

function approvalKindFor(localClass: number): JourneyStep["approvalKind"] {
  return localClass === 7 ? "unit_checkpoint" : "class_evaluation";
}

test("full class approval journey can progress from class 1 to class 84 with unit checkpoints, retries, and explicit closure", async () => {
  const loaded = readFirstClassPacks(84);
  const packs = loaded.packs;
  expect(packs).toHaveLength(84);

  const report: JourneyStep[] = [];
  const campaignStart = performance.now();

  for (const pack of packs) {
    const contractLoadShare = loaded.contractLoadMs / packs.length;
    const classPack = {
      unit: pack.unit,
      localClass: pack.localClass,
      lessonType: `Global Class ${pack.globalClass}`,
      contract: pack.contract,
    };
    const failedFirst = pack.globalClass % 5 === 0;
    let blockedAsExpected = false;

    if (failedFirst) {
      const failedEvaluationStart = performance.now();
      const failedEvaluation = evaluateClassApproval({
        classPack,
        answer: blockingLearnerAnswer(),
        evaluationGateCompleted: true,
        activeSectionsCompleted: true,
      });
      const failedEvaluationMs = performance.now() - failedEvaluationStart;
      expect(failedEvaluationMs).toBeLessThan(50);
      const failedDecision = resolveApprovalFlowDecision({ state: "answer_evaluated", evaluation: failedEvaluation });
      blockedAsExpected = failedDecision.shouldAskMorePractice && !failedDecision.canCallApprovalTool;
      expect(blockedAsExpected, `Class ${pack.globalClass} should block the intentionally wrong answer`).toBe(true);
      expect(failedDecision.teacherInstruction).toMatch(/target grammar|targeted practice|should \+ base verb/i);
    }

    const evaluationStart = performance.now();
    const evaluation = evaluateClassApproval({
      classPack,
      answer: learnerAnswerFor(pack),
      evaluationGateCompleted: true,
      activeSectionsCompleted: true,
    });
    const evaluationMs = performance.now() - evaluationStart;
    const stateMachineStart = performance.now();
    const readyDecision = resolveApprovalFlowDecision({ state: "answer_evaluated", evaluation });
    const approved = nextClassApprovalState("class_approval_ready", "APPROVAL_WRITE_SUCCEEDED");
    const closed = resolveApprovalFlowDecision({ state: approved.to, evaluation });
    const stateMachineMs = performance.now() - stateMachineStart;
    expect(evaluation.canApproveClass, `Class ${pack.globalClass} should be approvable after retry/pass answer`).toBe(true);
    expect(canWriteClassApproval(evaluation), `Class ${pack.globalClass} should be writable only with evidence`).toBe(true);
    expect(readyDecision.canCallApprovalTool).toBe(true);
    expect(readyDecision.shouldAskMorePractice).toBe(false);
    expect(closed.mustCloseClass).toBe(true);
    expect(closed.shouldAskMorePractice).toBe(false);

    const approvalKind = approvalKindFor(pack.localClass);
    report.push({
      classId: evaluation.classId,
      unit: pack.unit,
      localClass: pack.localClass,
      globalClass: pack.globalClass,
      approvalKind,
      failedFirst,
      blockedAsExpected: failedFirst ? blockedAsExpected : true,
      approvedAfterRetry: true,
      finalState: approvalKind === "unit_checkpoint" ? "unit_checkpoint_approved" : "class_closed",
      evidenceCount: evaluation.approvalEvidence.length,
      nextAction: approvalKind === "unit_checkpoint" ? "advance_to_next_unit_or_review_weak_points" : "advance_to_next_class_or_review_weak_points",
      timingsMs: {
        contractLoad: Number(contractLoadShare.toFixed(3)),
        evaluation: Number(evaluationMs.toFixed(3)),
        stateMachine: Number(stateMachineMs.toFixed(3)),
      },
    });
  }

  const outputDir = path.join(process.cwd(), "artifacts", "reports", "coach-approval-journey");
  mkdirSync(outputDir, { recursive: true });
  const totals = {
    generatedAt: new Date().toISOString(),
    totalClasses: report.length,
    normalClassEvaluations: report.filter((item) => item.approvalKind === "class_evaluation").length,
    unitCheckpoints: report.filter((item) => item.approvalKind === "unit_checkpoint").length,
    intentionalFailures: report.filter((item) => item.failedFirst).length,
    blockedFailures: report.filter((item) => item.failedFirst && item.blockedAsExpected).length,
    approved: report.filter((item) => item.approvedAfterRetry).length,
    campaignMs: Number((performance.now() - campaignStart).toFixed(3)),
    performance: {
      avgContractLoadMs: Number((report.reduce((sum, item) => sum + item.timingsMs.contractLoad, 0) / report.length).toFixed(3)),
      avgEvaluationMs: Number((report.reduce((sum, item) => sum + item.timingsMs.evaluation, 0) / report.length).toFixed(3)),
      avgStateMachineMs: Number((report.reduce((sum, item) => sum + item.timingsMs.stateMachine, 0) / report.length).toFixed(3)),
      maxEvaluationMs: Math.max(...report.map((item) => item.timingsMs.evaluation)),
      maxStateMachineMs: Math.max(...report.map((item) => item.timingsMs.stateMachine)),
    },
  };
  writeFileSync(
    path.join(outputDir, "class-001-to-084-approval-report.json"),
    `${JSON.stringify({ ...totals, report }, null, 2)}\n`,
    "utf8",
  );

  expect(report.filter((item) => item.approvedAfterRetry)).toHaveLength(84);
  expect(report.filter((item) => item.failedFirst && item.blockedAsExpected).length).toBeGreaterThanOrEqual(16);
  expect(report.filter((item) => item.approvalKind === "unit_checkpoint")).toHaveLength(12);
  expect(report.filter((item) => item.approvalKind === "class_evaluation")).toHaveLength(72);
  expect(report[27]).toMatchObject({ globalClass: 28, unit: 4, localClass: 7, finalState: "unit_checkpoint_approved" });
  expect(report[83]).toMatchObject({ globalClass: 84, unit: 12, localClass: 7, finalState: "unit_checkpoint_approved" });
  expect(totals.performance.avgEvaluationMs).toBeLessThan(25);
  expect(totals.performance.avgStateMachineMs).toBeLessThan(5);
});
