import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  evaluateClassApproval,
} from "../../src/modules/coach-approval/application";
import {
  resolveApprovalFlowDecision,
} from "../../src/modules/coach-approval/stateMachine";
import {
  classIdentity,
  loadClassPack,
  unitTitle,
} from "../../src/modules/coach-delivery/teachingContracts";
import {
  learnerPositionLine,
  renderClassReply,
} from "../../src/modules/coach-delivery/replyRendering";

const forbiddenLearnerFacing = [
  "Clase actual / contenido de clase",
  "viewing_current_class",
  "Extract exact",
  "Extract vocabulary",
  "Use the target language from the indexed page range",
  "anchored to Student Book pages",
  "Student Book page range",
  "Do not infer unindexed wording",
  "recycle only confirmed unit vocabulary",
];

function selectedFortyPercentSample() {
  const sample: Array<{ unit: number; localClass: number; globalClass: number }> = [];
  for (let unit = 1; unit <= 12; unit += 1) {
    const normalClasses = unit <= 10 ? [1, 4] : [1];
    for (const localClass of normalClasses) {
      sample.push({ unit, localClass, globalClass: (unit - 1) * 7 + localClass });
    }
    sample.push({ unit, localClass: 7, globalClass: unit * 7 });
  }
  return sample.sort((a, b) => a.globalClass - b.globalClass);
}

function passingAnswerFor(unit: number, localClass: number) {
  return [
    `For Unit ${unit}, Class ${localClass}, I can complete the learning task with a clear example.`,
    "I used to make short answers, but I have become more confident when I explain my ideas.",
    "As soon as I understand the question, I organize my answer before I speak.",
    "You might want to compare two options, although the best solution depends on the context.",
    "This answer includes vocabulary, grammar, production, and a short professional reason.",
  ].join(" ");
}

function failingAnswer() {
  return "I should to studied more.";
}

function sampleTeacherBody(identity: ReturnType<typeof classIdentity>) {
  const section = identity.sections.split("+")[0]?.trim() || identity.lessonTitle || "Starting point";
  return [
    `## ${section}`,
    "",
    "Let's start with a compact teacher-led step.",
    "",
    "Two model answers:",
    "",
    "> I can connect this lesson to my work with one clear example.",
    "> I can use the target language and explain my reason.",
    "",
    "Your turn - answer in English with two short sentences. Use one useful chunk from this class.",
  ].join("\n");
}

test("40 percent release sample covers 34 classes, all unit checkpoints, pedagogy rendering, and approval behavior", async () => {
  const sample = selectedFortyPercentSample();
  expect(sample).toHaveLength(34);
  expect(new Set(sample.map((item) => item.unit)).size).toBe(12);
  expect(sample.filter((item) => item.localClass === 7)).toHaveLength(12);

  const rows = [];
  const start = performance.now();

  for (const item of sample) {
    const contractStart = performance.now();
    const pack = loadClassPack(item.unit, item.localClass);
    const contractLoadMs = performance.now() - contractStart;
    expect(pack.content, `Missing class pack for Unit ${item.unit} Class ${item.localClass}`).toBeTruthy();

    const identity = classIdentity(pack.content);
    const approvalKind = item.localClass === 7 ? "unit_checkpoint" : "class_evaluation";
    const position = learnerPositionLine({
      context: {
        user: { Name: "QA Learner" },
        learningState: { currentUnit: `Unit ${item.unit}`, currentClass: item.localClass },
      },
      name: "QA Learner",
      requestedUnit: item.unit,
      requestedClass: item.localClass,
      explicitClassRequest: true,
    });

    const renderStart = performance.now();
    const reply = renderClassReply({
      body: sampleTeacherBody(identity),
      position,
      identity,
      unit: item.unit,
      localClass: item.localClass,
      displayClass: item.globalClass,
    });
    const renderMs = performance.now() - renderStart;

    for (const marker of forbiddenLearnerFacing) {
      expect(reply, `Forbidden marker "${marker}" leaked in Unit ${item.unit} Class ${item.localClass}`).not.toContain(marker);
    }
    expect(reply).toContain(`Unit ${item.unit}`);
    expect(reply).toContain(unitTitle(item.unit));
    expect(reply).toContain("Ruta de clase");
    expect(reply).toMatch(/Your turn|answer in English|Write|Complete|Try/i);
    if (approvalKind === "unit_checkpoint") {
      expect(reply).toContain("Checkpoint de unidad");
    }

    const failedEvaluation = evaluateClassApproval({
      classPack: { unit: item.unit, localClass: item.localClass, lessonType: identity.lessonTitle, contract: pack.content },
      answer: failingAnswer(),
      evaluationGateCompleted: true,
      activeSectionsCompleted: true,
    });
    const failedDecision = resolveApprovalFlowDecision({ state: "answer_evaluated", evaluation: failedEvaluation });
    expect(failedDecision.canCallApprovalTool).toBe(false);
    expect(failedDecision.shouldAskMorePractice).toBe(true);

    const evaluationStart = performance.now();
    const passedEvaluation = evaluateClassApproval({
      classPack: { unit: item.unit, localClass: item.localClass, lessonType: identity.lessonTitle, contract: pack.content },
      answer: passingAnswerFor(item.unit, item.localClass),
      evaluationGateCompleted: true,
      activeSectionsCompleted: true,
    });
    const evaluationMs = performance.now() - evaluationStart;
    const passedDecision = resolveApprovalFlowDecision({ state: "answer_evaluated", evaluation: passedEvaluation });
    expect(passedEvaluation.canApproveClass).toBe(true);
    expect(passedDecision.canCallApprovalTool).toBe(true);
    expect(passedDecision.shouldAskMorePractice).toBe(false);

    rows.push({
      unit: item.unit,
      localClass: item.localClass,
      globalClass: item.globalClass,
      approvalKind,
      title: unitTitle(item.unit),
      lesson: identity.lessonTitle,
      sections: identity.sections,
      forbiddenMetadata: false,
      failedAnswerBlocked: true,
      passingAnswerApproved: true,
      checkpointAnnounced: approvalKind === "unit_checkpoint",
      timingsMs: {
        contractLoad: Number(contractLoadMs.toFixed(3)),
        render: Number(renderMs.toFixed(3)),
        evaluation: Number(evaluationMs.toFixed(3)),
      },
    });
  }

  const outputDir = path.join(process.cwd(), "artifacts", "reports", "coach-release-sample");
  mkdirSync(outputDir, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    coveragePercent: Number(((rows.length / 84) * 100).toFixed(2)),
    unitsCovered: new Set(rows.map((row) => row.unit)).size,
    normalClassEvaluations: rows.filter((row) => row.approvalKind === "class_evaluation").length,
    unitCheckpoints: rows.filter((row) => row.approvalKind === "unit_checkpoint").length,
    failedAnswersBlocked: rows.filter((row) => row.failedAnswerBlocked).length,
    passingAnswersApproved: rows.filter((row) => row.passingAnswerApproved).length,
    campaignMs: Number((performance.now() - start).toFixed(3)),
    performance: {
      avgContractLoadMs: Number((rows.reduce((sum, row) => sum + row.timingsMs.contractLoad, 0) / rows.length).toFixed(3)),
      avgRenderMs: Number((rows.reduce((sum, row) => sum + row.timingsMs.render, 0) / rows.length).toFixed(3)),
      avgEvaluationMs: Number((rows.reduce((sum, row) => sum + row.timingsMs.evaluation, 0) / rows.length).toFixed(3)),
    },
    rows,
  };
  writeFileSync(path.join(outputDir, "release-40-percent-sample-report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  expect(summary.coveragePercent).toBeGreaterThanOrEqual(40);
  expect(summary.unitCheckpoints).toBe(12);
  expect(summary.normalClassEvaluations).toBe(22);
  expect(summary.failedAnswersBlocked).toBe(34);
  expect(summary.passingAnswersApproved).toBe(34);
  expect(summary.performance.avgRenderMs).toBeLessThan(10);
  expect(summary.performance.avgEvaluationMs).toBeLessThan(25);
});
