import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  canWriteClassApproval,
  evaluateClassApproval,
} from "../../src/modules/coach-approval/application";
import {
  nextClassApprovalState,
  resolveApprovalFlowDecision,
} from "../../src/modules/coach-approval/stateMachine";

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const classApprovalSimulations = [
  {
    name: "Unit 1 Class 2 - personality change",
    classPack: {
      unit: 1,
      localClass: 2,
      lessonType: "Listening + Discussion + Writing",
      contract:
        "Active class grammar focus: used to be; has become. Active class vocabulary focus: shy and reserved; friendly and outgoing; kind and generous. Expected learner production: describe how someone has changed and write a short paragraph.",
    },
    answer:
      "I used to be shy and reserved, but I have become more friendly and outgoing at work. My main positive quality is that I stay calm in meetings.",
  },
  {
    name: "Unit 2 Class 1 - past mistakes",
    classPack: {
      unit: 2,
      localClass: 1,
      lessonType: "Starting point + Listening + Grammar + Discussion",
      contract:
        "Active class grammar focus: should have + past participle; was supposed to + base verb; didn't have to + base verb. Active class vocabulary focus: mistake; obligation; regret. Expected learner production: talk about a past mistake or obligation.",
    },
    answer:
      "I was supposed to finish the report on Friday, but I waited too long. I should have planned my time better because the mistake created more stress.",
  },
  {
    name: "Unit 2 Class 2 - recognizing problems",
    classPack: {
      unit: 2,
      localClass: 2,
      lessonType: "Vocabulary + Listening + Writing",
      contract:
        "Active class vocabulary focus: ignore a problem; deal with a problem; aggravate a problem; run into problems; solve a problem. Expected learner production: describe a real problem and how people handle it.",
    },
    answer:
      "My team ran into problems during a software update. We dealt with the problem early, so we solved it before it could aggravate the situation.",
  },
  {
    name: "Unit 2 Class 4 - mysteries and certainty",
    classPack: {
      unit: 2,
      localClass: 4,
      lessonType: "Starting point + Grammar + Discussion",
      contract:
        "Active class grammar focus: modals of certainty and uncertainty; must have; might have; could have. Active class vocabulary focus: mystery; hoax; strange event. Expected learner production: explain a mystery and disagree politely.",
    },
    answer:
      "The artist must have wanted to keep his identity secret. However, the website story might have been a hoax because nobody was completely sure.",
  },
  {
    name: "Unit 3 Class 1 - describing cities",
    classPack: {
      unit: 3,
      localClass: 1,
      lessonType: "Starting point + Grammar + Speaking",
      contract:
        "Active class grammar focus: adjective clauses; relative clauses; that; where; which. Active class vocabulary focus: city; neighborhood; public transportation; green spaces. Expected learner production: describe a city or place clearly.",
    },
    answer:
      "Bogotá is a city that has many cultural places and good restaurants. It is also a place where people can find parks, museums, and business opportunities.",
  },
  {
    name: "Unit 4 Class 1 - time clauses",
    classPack: {
      unit: 4,
      localClass: 1,
      lessonType: "Starting point + Discussion + Grammar + Vocabulary & Speaking",
      contract:
        "Active class grammar focus: time clauses; after; before; while; as soon as; until. Active class vocabulary focus: morning person; night owl; perk up; doze off. Expected learner production: describe routines and energy patterns.",
    },
    answer:
      "As soon as I wake up, I check my schedule and drink coffee. After I finish my first meeting, I usually perk up and feel more focused.",
  },
  {
    name: "Unit 4 Class 2 - advice for stress",
    classPack: {
      unit: 4,
      localClass: 2,
      lessonType: "Listening & Speaking + Role Play + Writing",
      contract:
        "Active class grammar focus: advice language; should; might want to; it might not be a bad idea. Active class vocabulary focus: stress; fatigue; lack of energy; take a hot bath; call a friend. Expected learner production: give advice about stress and energy problems.",
    },
    answer:
      "You might want to call a friend when you feel stressed. It might not be a bad idea to take a hot bath and sleep earlier because fatigue affects your focus.",
  },
  {
    name: "Unit 5 Class 1 - making conversation",
    classPack: {
      unit: 5,
      localClass: 1,
      lessonType: "Starting point + Reading + Vocabulary & Speaking",
      contract:
        "Active class target structures: infinitive phrases; gerund phrases; make conversation; describe polite and rude behavior. Active class vocabulary focus: polite; rude; unusual; inappropriate. Expected learner production: talk about social behavior.",
    },
    answer:
      "It is polite to ask follow-up questions when you meet someone new. Interrupting people is rude, but listening carefully makes conversation easier.",
  },
  {
    name: "Unit 5 Class 2 - small talk role play",
    classPack: {
      unit: 5,
      localClass: 2,
      lessonType: "Role Play + Listening + Writing",
      contract:
        "Active class skill focus: role play; listening for conversation closings; writing with an outline. Active class vocabulary focus: small talk; openers; closers; How's it going?; See you later; I've got to run. Expected learner production: start, continue, and close a short conversation.",
    },
    answer:
      "A: Hi, how's it going? B: Pretty good, thanks. Do you know many people here? A: Not yet, but it was great to meet you. I've got to run, so see you later.",
  },
  {
    name: "Unit 6 Class 1 - experiences",
    classPack: {
      unit: 6,
      localClass: 1,
      lessonType: "Grammar + Discussion + Speaking",
      contract:
        "Active class grammar focus: present perfect; have/has + past participle; talk about experiences. Active class vocabulary focus: experience; achievement; challenge. Expected learner production: describe an experience and give one detail.",
    },
    answer:
      "I have worked on several digital transformation projects. The biggest challenge has been explaining technical risks clearly to business leaders.",
  },
];

test.describe("class approval simulations across varied classes", () => {
  for (const scenario of classApprovalSimulations) {
    test(`${scenario.name} can be approved with class-specific evidence`, async () => {
      const evaluation = evaluateClassApproval({
        classPack: scenario.classPack,
        answer: scenario.answer,
        evaluationGateCompleted: true,
        activeSectionsCompleted: true,
      });

      expect(evaluation.classId).not.toBe("active-class");
      expect(evaluation.canApproveClass).toBe(true);
      expect(evaluation.grammarApproved).toBe(true);
      expect(evaluation.vocabularyApproved).toBe(true);
      expect(evaluation.communicativeGoalApproved).toBe(true);
      expect(evaluation.productionApproved).toBe(true);
      expect(evaluation.approvalEvidence.length).toBeGreaterThanOrEqual(5);
      expect(canWriteClassApproval(evaluation)).toBe(true);
    });
  }
});

test("approval state machine closes an approved class instead of looping into more practice", async () => {
  const evaluation = evaluateClassApproval({
    classPack: classApprovalSimulations[6].classPack,
    answer: classApprovalSimulations[6].answer,
  });

  const ready = resolveApprovalFlowDecision({ state: "answer_evaluated", evaluation });
  expect(ready.canCallApprovalTool).toBe(true);
  expect(ready.shouldAskMorePractice).toBe(false);
  expect(ready.nextState).toBe("class_approval_ready");

  const approved = nextClassApprovalState("class_approval_ready", "APPROVAL_WRITE_SUCCEEDED");
  expect(approved.to).toBe("class_approved");

  const closed = resolveApprovalFlowDecision({ state: "class_approved", evaluation });
  expect(closed.mustCloseClass).toBe(true);
  expect(closed.shouldAskMorePractice).toBe(false);
  expect(closed.teacherInstruction).toContain("Do not ask more practice");
});

test("approval state machine keeps practicing when the class rubric is not met", async () => {
  const evaluation = evaluateClassApproval({
    classPack: classApprovalSimulations[1].classPack,
    answer: "I should to studied more.",
  });

  const decision = resolveApprovalFlowDecision({ state: "answer_evaluated", evaluation });
  expect(decision.canCallApprovalTool).toBe(false);
  expect(decision.shouldAskMorePractice).toBe(true);
  expect(decision.teacherInstruction).toContain("should + base verb");
});

test("MCP approval tool requires evaluated evidence, not only confirm=true", async () => {
  const source = readWorkspaceFile("src/app/api/mcp/route.ts");

  expect(source).toContain("canWriteClassApproval");
  expect(source).toContain("Class approval blocked");
  expect(source).toContain('required: ["userEmail", "confirm", "evaluation"]');
  expect(source).toContain("approvalEvidence");
});
