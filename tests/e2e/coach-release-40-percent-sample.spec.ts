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
import { courseStructureRepository } from "../../src/modules/coach-config/pedagogyConfig";

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
  const repository = courseStructureRepository();
  const sample: Array<{ unit: number; localClass: number; globalClass: number }> = [];
  const units = Array.from(new Set(repository.allClasses().map((item) => item.unit)));
  units.forEach((unit, unitIndex) => {
    const unitClasses = repository.allClasses().filter((item) => item.unit === unit);
    const first = unitClasses[0];
    const middle = unitClasses[Math.floor((unitClasses.length - 1) / 2)];
    const checkpoint = unitClasses.find((item) => repository.isUnitCheckpoint(item.unit, item.localClass)) || unitClasses[unitClasses.length - 1];
    const nonCheckpointItems = unitIndex < 10 ? [first, middle] : [first];
    for (const item of [...nonCheckpointItems, checkpoint]) {
      if (item && !sample.some((existing) => existing.globalClass === item.globalClass)) sample.push(item);
    }
  });
  return sample.sort((a, b) => a.globalClass - b.globalClass);
}

function passingAnswerFor(unit: number, localClass: number, identity: ReturnType<typeof classIdentity>) {
  return [
    `For Unit ${unit}, Class ${localClass}, I can complete the learning task with a clear example.`,
    `I can use grammar or key language such as ${identity.grammarFocus || identity.targetStructures || "the target structure"}.`,
    `I can use vocabulary such as ${identity.vocabularyFocus || "useful class chunks"} in a meaningful answer.`,
    `The expected production is to ${identity.expectedProduction || "answer clearly with a relevant example"}.`,
    "I used to make short answers, but I have become more confident when I explain my ideas.",
    "As soon as I understand the question, I organize my answer before I speak.",
    "My routine, sleep habits, and productivity are better when I plan my schedule.",
    "You might want to compare two options, although the best solution depends on the context.",
    "How's it going? It was great to meet you; I have worked on this before.",
    "A natural disaster, political crisis, or scandal can count as real news when people need reliable information.",
    "He said that it was a secret, and she asked me what I was saying.",
    "I wonder why the service is so slow, and I feel frustrated when a problem is not solved.",
    "Even if I were busy, I would be honest, and I would keep it a secret only if it were ethical.",
    "By the end of next year, I will have improved my English, and I will have been practicing every week.",
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
    "### Model answers.",
    "",
    "> I can connect this lesson to my work with one clear example.",
    "> I can use the target language and explain my reason.",
    "",
    "### Your turn.",
    "",
    "Answer in English with two short sentences. Use one useful chunk from this class.",
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
    expect(reply).toContain("Primero verás la explicación, ejemplos y una práctica guiada");
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
      answer: passingAnswerFor(item.unit, item.localClass, identity),
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
  expect(summary.performance.avgRenderMs).toBeLessThan(50);
  expect(summary.performance.avgEvaluationMs).toBeLessThan(25);
});
