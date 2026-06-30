import { test, expect } from "@playwright/test";
import {
  advanceClassProgressFromReply,
  buildClassProgressInstruction,
  classProgressKey,
  classRoadmapFromSections,
  createClassProgress,
  loadStoredClassProgress,
  resolveClassProgressBeforeModel,
  resolveClassProgressTurn,
  saveStoredClassProgress,
} from "../../src/modules/coach-class-progress/application";

const identity = {
  lessonTitle: "Video Class",
  bookPages: "",
  pdfPages: "",
  sections: "Video Class + Before watching + While watching + After watching + Speaking",
  skillFocus: "video discussion",
  grammarFocus: "Unit 4 review and communicative extension; time clauses, routines, preferences, and advice-style explanations",
  vocabularyFocus: "time of day; morning person; late riser; night owl; energy; sleep; habits; productivity; schedules",
  functions: "prepare to watch a unit-related video; understand main ideas and details; discuss routines, sleep habits, energy, and productivity",
  targetStructures: "As soon as I...; Whenever I...; After I...; Before I...; I prefer... because...; I agree / disagree because...",
  expectedProduction: "answer before/while/after watching questions and hold a short discussion using Unit 4 language",
};

const unit5Class30Identity = {
  lessonTitle: "Making conversation",
  bookPages: "",
  pdfPages: "",
  sections: "Role Play + Listening + Discussion + Writing",
  skillFocus: "role play, listening for conversation closings, and writing with an outline",
  grammarFocus: "conversation openers and closers; be considered + adjective",
  vocabularyFocus: "small talk; conversation openers; conversation closers; appropriate; polite; rude; bad form",
  functions: "start, keep going, and close small talk naturally; write a short outline about a cultural rule",
  targetStructures: "How's it going?; Do you know many people here?; It was great to meet you; I should get going; be considered + adjective",
  expectedProduction: "write a small-talk exchange with an opener and closer, answer gist/detail questions, and write a short outline",
};

test("class progress builds the finite learner roadmap without wrapper sections", () => {
  expect(classRoadmapFromSections(identity.sections)).toEqual([
    "Before watching",
    "While/After watching",
    "Speaking",
    "Evaluation gate",
  ]);

  const progress = createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity });
  expect(progress).toMatchObject({
    unit: 4,
    localClass: 7,
    displayClass: 28,
    currentStepIndex: 0,
    completedStepIndexes: [],
    status: "awaiting_answer",
  });
});

test("class progress instruction makes application state authoritative", () => {
  const progress = createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity });
  const instruction = buildClassProgressInstruction({
    ...progress,
    currentStepIndex: 1,
    completedStepIndexes: [0],
  });

  expect(instruction).toContain("CLASS PROGRESS STATE");
  expect(instruction).toContain("Current step: Paso 2 de 4 - While/After watching");
  expect(instruction).toContain("advance to Paso 3 - Speaking");
  expect(instruction).toContain("do not create a teacher listening simulation by default");
  expect(instruction).toContain("Never open the same numbered step again after approving it");
});

test("approved answers advance exactly one visible step and prevent same-step loops", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(
    progress,
    "This micro-step is approved.\n\nNext micro-step: Paso 3 de 5 - After watching.\n\nAnswer this reflection.",
  );

  expect(next.currentStepIndex).toBe(2);
  expect(next.completedStepIndexes).toEqual([0, 1]);
  expect(next.lastApprovedStepIndex).toBe(1);
  expect(next.status).toBe("awaiting_answer");
});

test("approved answers advance even when the model repeats the same step announcement", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(
    progress,
    "This micro-step is approved.\n\nNext micro-step: Paso 2 de 5 - While watching.\n\nTeacher listening input:",
  );

  expect(next.currentStepIndex).toBe(2);
  expect(next.completedStepIndexes).toEqual([0, 1]);
  expect(next.lastApprovedStepIndex).toBe(1);
});

test("class progress resolver repairs real loop: learner answer is not sent back to the same video simulation", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "The main idea is that different people have different energy patterns and routines. The woman is a morning person, and she plans her day as soon as she arrives at work.",
    reply: "We’re at Paso 2 de 5 - While watching.\nSince the real video isn’t being quoted here, I’ll use a short teacher-created listening simulation.\n\nTeacher listening input:",
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.currentStepIndex).toBe(2);
  expect(resolved.reply).toContain("Paso 3 de 4 - Speaking");
  expect(resolved.reply).not.toContain("Teacher listening input");
});

test("video while-watching step asks for the real resource before using a fallback simulation", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "continuemos",
    reply: "We’re at Paso 2 de 5 - While watching.\nTeacher listening input:\nA: Early birds work best in the morning.",
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.currentStepIndex).toBe(1);
  expect(resolved.reply).toContain("Open the video or class resource");
  expect(resolved.reply).toContain("If you cannot open the video");
  expect(resolved.reply).not.toContain("Teacher listening input");
});

test("evaluation gate is class-specific instead of a generic short-items prompt", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 2,
    completedStepIndexes: [0, 1],
  };
  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "I prefer working early because I have more energy. Before I start work, I organize my tasks and choose the most difficult one first.",
    reply: "👍 Good answer. This micro-step is approved.\n\nYou completed Paso 4 de 5 - Speaking.\n\nNext micro-step: Paso 5 de 5 - Evaluation gate.\n\nFinal checkpoint: answer with 3-5 short items using the target grammar, vocabulary, and one personal example.",
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.progress.currentStepIndex).toBe(3);
  expect(resolved.reply).toContain("Final checkpoint: complete these items");
  expect(resolved.reply).toContain("As soon as I...");
  expect(resolved.reply).toContain("morning person");
  expect(resolved.reply).toContain("discuss routines, sleep habits, energy, and productivity");
  expect(resolved.reply).not.toContain("3-5 short items");
});

test("focused retry keeps the learner on the same visible step", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };
  const next = advanceClassProgressFromReply(progress, "Almost there - one focused retry. Focused retry: Paso 2 de 5 - While watching.");

  expect(next.currentStepIndex).toBe(1);
  expect(next.completedStepIndexes).toEqual([0]);
  expect(next.status).toBe("needs_retry");
});

test("real transcript regression: valid English before-watching answer is not rejected as non-English", () => {
  const progress = createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity });
  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "I am more like an early bird because I feel more focused in the morning. As soon as I wake up, I organize my tasks and plan my day. I prefer working early because I have more energy.",
    reply: [
      "Almost there — one focused retry.",
      "",
      "Your answer is a good start, but I need it in English and with one target pattern.",
      "Now write your answer in English.",
    ].join("\n"),
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.currentStepIndex).toBe(1);
  expect(resolved.progress.completedStepIndexes).toEqual([0]);
  expect(resolved.reply).toContain("You completed Paso 1 de 4 - Before watching");
  expect(resolved.reply).toContain("Next block: Paso 2 de 4 - While/After watching");
  expect(resolved.reply).not.toContain("I need it in English");
});

test("real transcript regression: after-watching answer cannot be routed back to Paso 1", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 2,
    completedStepIndexes: [0, 1],
  };

  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: "The video is about how electronics can affect sleep and energy. I sometimes use my phone before I go to bed, but I feel more productive when I sleep well.",
    reply: [
      "👍",
      "",
      "You already answered Paso 1 de 5 — Before watching very well, so this micro-step is approved.",
      "",
      "Quick correction",
      "Original sentence",
      "I am more like an early bird because I feel more focused in the morning.",
      "",
      "Next micro-step: Paso 4 de 5 - Speaking.",
    ].join("\n"),
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.currentStepIndex).toBe(3);
  expect(resolved.progress.completedStepIndexes).toEqual([0, 1, 2]);
  expect(resolved.reply).toContain("You completed Paso 3 de 4 - Speaking");
  expect(resolved.reply).toContain("Next block: Paso 4 de 4 - Evaluation gate");
  expect(resolved.reply).not.toContain("Original sentence\nI am more like an early bird");
});

test("real transcript regression: evaluation gate answer closes the class instead of restarting Paso 1", () => {
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 3,
    completedStepIndexes: [0, 1, 2],
    status: "evaluation_ready" as const,
  };

  const resolved = resolveClassProgressTurn({
    progress,
    learnerMessage: [
      "The class and video topic are about routines, sleep habits, energy, and productivity.",
      "As soon as I wake up, I organize my tasks and plan my day.",
      "I am more of a morning person because I have more energy early in the day.",
      "A late riser or a night owl may feel more productive later in the evening.",
      "Before watching, I expected the video to show how people manage their schedules and energy.",
      "After watching, I think it is important to understand my routine so I can work better and avoid distractions.",
    ].join(" "),
    reply: [
      "Pedro Figueroa, encontré tu clase activa en English OS: Unit 4, Class 28.",
      "",
      "Unit 4 — Early birds and night owls.",
      "Hoy trabajaremos class 28 · Video Class. Ruta de clase: Paso 1 de 5 — Before watching.",
      "",
      "Video Class — Before watching",
      "Teacher listening input:",
      "A: I’m a night owl, so I work better in the evening.",
    ].join("\n"),
    nowIso: "2026-06-27T00:00:00.000Z",
  });

  expect(resolved.repaired).toBe(true);
  expect(resolved.progress.status).toBe("approved");
  expect(resolved.progress.currentStepIndex).toBe(3);
  expect(resolved.progress.completedStepIndexes).toEqual([0, 1, 2, 3]);
  expect(resolved.reply).toContain("Class approved");
  expect(resolved.reply).toContain("Unit 4 checkpoint approved");
  expect(resolved.reply).not.toContain("Paso 1 de 5");
  expect(resolved.reply).not.toContain("Teacher listening input");
});

test("pre-model deterministic gate closes a visible evaluation gate even when stored progress is behind", () => {
  const progress = createClassProgress({ unit: 5, localClass: 2, displayClass: 30, identity: unit5Class30Identity });
  const visibleGate = [
    "Evaluation gate",
    "1. Role play: Write a 4-line small-talk exchange.",
    "2. Listening: What is the gist of the conversation?",
    "3. Listening detail: Which closing phrases do you hear?",
    "4. Writing: Write a 3-sentence outline about a cultural rule.",
  ].join("\n");

  const resolved = resolveClassProgressBeforeModel({
    progress,
    recentCoachText: visibleGate,
    learnerMessage: [
      "A: Hi, how's it going? B: Pretty good, thanks. Do you know many people here?",
      "A: Not really, but this party is nice. B: It was great to meet you. I should get going.",
      "The gist is that two people start small talk and close politely.",
      "The closing phrases are it was great to meet you and I should get going.",
      "In my country, arriving on time is considered polite. People usually greet everyone first. This is important because it shows respect.",
    ].join(" "),
    nowIso: "2026-06-28T00:00:00.000Z",
  });

  expect(resolved).not.toBeNull();
  expect(resolved?.source).toBe("structured_evaluation_gate_event");
  expect(resolved?.progress.status).toBe("approved");
  expect(resolved?.reply).toContain("Class 30 approved");
  expect(resolved?.reply).toContain("Class approved");
  expect(resolved?.reply).not.toContain("Paso 1 de 3");
  expect(resolved?.reply).not.toContain("Rewrite these ideas");
});

test("pre-model deterministic progress advances a learner production answer without reopening the class", () => {
  const progress = createClassProgress({ unit: 5, localClass: 2, displayClass: 30, identity: unit5Class30Identity });

  const resolved = resolveClassProgressBeforeModel({
    progress,
    learnerMessage: "A: Hi, how's it going? B: Pretty good, thanks. Do you know many people here? A: Not really, but everyone seems friendly. B: It was great to meet you. I should get going.",
    nowIso: "2026-06-28T00:00:00.000Z",
  });

  expect(resolved).not.toBeNull();
  expect(resolved?.source).toBe("structured_learning_block_event");
  expect(resolved?.progress.currentStepIndex).toBe(1);
  expect(resolved?.reply).toContain("You completed Paso 1 de 3");
  expect(resolved?.reply).toContain("Next block: Paso 2 de 3 - Production");
  expect(resolved?.reply).not.toContain("Unit 5 — Communication");
});

test("class progress persists and resumes after interruption", () => {
  const storage = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const key = classProgressKey("learner@example.com");
  const progress = {
    ...createClassProgress({ unit: 4, localClass: 7, displayClass: 28, identity }),
    currentStepIndex: 1,
    completedStepIndexes: [0],
  };

  saveStoredClassProgress(adapter, key, progress);
  const restored = loadStoredClassProgress(adapter, key);

  expect(restored).toMatchObject({
    unit: 4,
    localClass: 7,
    displayClass: 28,
    currentStepIndex: 1,
    completedStepIndexes: [0],
  });
});
