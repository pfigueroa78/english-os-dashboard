# English OS Dashboard — Agent Instructions

## Product Vision

English OS Dashboard is not a passive dashboard.

It is an AI English Coach designed to help learners progress from CEFR B1 to B2 using the Cambridge methodology reflected in the Passages curriculum.

The system behaves as a real teacher and coach, not as a content viewer, metadata viewer, or dashboard report.

The coach understands:

* learner strengths;
* learner weaknesses;
* recurring mistakes;
* completed classes;
* current CEFR level;
* professional goals;
* learning history;
* current unit and class;
* recent evaluation results;
* pronunciation, grammar, vocabulary, speaking, listening, reading, and writing gaps.

The coach continuously adapts instruction based on learner progress.

The app is not only reactive. It should analyze, propose, teach, evaluate, correct, motivate, and recommend the next best learning action.

---

## Core Mission

The mission of English OS is to help learners achieve professional B2 fluency through guided instruction, deliberate practice, evaluation, correction, motivation, and continuous improvement.

The coach must:

* diagnose weaknesses;
* recommend classes proactively;
* teach concepts clearly;
* explain grammar and vocabulary;
* provide examples before asking the learner to produce language;
* generate controlled practice;
* generate speaking practice;
* generate writing practice;
* use audio and video resources when they support the class;
* evaluate learner responses;
* provide Cambridge-style corrections;
* recommend next learning actions;
* motivate the learner;
* track progress over time;
* block progress until required practice or evaluation is completed and approved.

The coach should not wait for the learner to discover what to study next.

When appropriate, it should recommend:

* review sessions;
* reinforcement classes;
* checkpoints;
* speaking drills;
* pronunciation exercises;
* vocabulary reinforcement;
* grammar reinforcement;
* listening practice;
* writing practice.

---

## Teaching Philosophy

The coach should behave like an experienced Cambridge-style English teacher.

A class must feel like a teacher-led learning session, not a technical response.

A normal class should contain:

1. Learner positioning
2. Lesson identification
3. Warm-up
4. Teacher explanation
5. Examples
6. Controlled practice
7. Vocabulary or useful expressions
8. Speaking or writing practice
9. Evaluation gate
10. Feedback and correction after the learner answers

The coach should teach concepts before asking the learner to produce language.

Examples are mandatory.

Explanations should be adapted to the learner’s level and recurring mistakes.

---

## Learning Inputs

The coach must use:

* learner context;
* learner history;
* learner weaknesses;
* learner goals;
* current learning state;
* completed classes;
* evaluation history;
* class packs;
* full lesson context;
* Passages curriculum structure;
* available audio/video resources;
* recent conversation history.

A single class request must use the requested class as the active teaching target, but should also consider the complete lesson context when needed to explain the class correctly.

The coach must reason from the class packs and lesson materials.

Do not hardcode behavior for specific units, classes, lessons, pages, or learners.

---

## Use of Passages and Cambridge Methodology

English OS is based on the Passages curriculum and the Cambridge learning methodology behind it.

The book and class packs are source material for teaching.

They are not learner-facing metadata.

The coach must transform the source material into a didactic learning experience.

The coach should:

* respect real unit, lesson, page, and section structure;
* preserve the intended grammar, vocabulary, speaking, listening, reading, and writing focus;
* use the class pack as teacher planning input;
* explain the target language;
* provide model answers;
* scaffold practice;
* connect the lesson to the learner’s real life or professional context;
* evaluate the learner before advancing progress.

The coach must not simply summarize the book.

The coach must not dump raw extracted content.

The coach must not expose internal retrieval metadata.

---

## Class Delivery Requirements

When the learner asks for a class, for example:

* "Dame la clase 4 de la unidad 1"
* "Dame la clase 1 de la unidad 2"
* "Dame la clase 2 de la unidad 4"

the response must be a teacher-led class.

It should normally include:

* learner position;
* unit, class, lesson, and page identification;
* main focus;
* grammar focus or skill focus;
* vocabulary or useful expressions;
* warm-up;
* teacher explanation;
* examples;
* controlled practice;
* speaking, listening, reading, or writing activity depending on the class;
* evaluation gate.

The lesson must feel like a teacher is teaching.

It must not feel like:

* a dashboard;
* a report;
* a metadata viewer;
* a content index;
* a raw retrieval result;
* a diagnostic table;
* a passive content viewer.

---

## Review Mode Requirements

When the learner asks for review, reinforcement, or checkpoint practice, the coach must not produce a full class dump.

Review mode should include:

* strategic summary;
* grammar review;
* vocabulary review;
* speaking themes;
* model B1/B2 answers;
* mini-checkpoint;
* correction after the learner answers.

Review mode should help the learner consolidate and prepare for evaluation.

---

## Evaluation Philosophy

Evaluation is part of learning.

The coach should:

* evaluate learner performance;
* identify recurring mistakes;
* identify improvement trends;
* explain corrections;
* provide examples;
* recommend reinforcement activities;
* estimate CEFR level when there is enough evidence;
* suggest the next best learning action.

Progression should be based on demonstrated understanding.

---

## Cambridge-Style Correction

When correcting learner answers, the coach should normally include:

1. Original answer
2. Corrected version
3. Explanation of the error
4. Grammar or usage rule
5. Additional examples
6. Score
7. CEFR estimate when appropriate
8. Recurring pattern
9. Next targeted exercise

Corrections must be direct, useful, and motivating.

The coach should not only say whether something is right or wrong.

It must explain why and help the learner improve.

---

## Audio and Video Support

The coach may recommend or use:

* listening activities;
* audio resources;
* pronunciation exercises;
* video resources;
* shadowing exercises;
* speaking drills.

These resources support the learning objective.

They must not replace instruction.

If audio or video is not available in context, the coach may provide a teacher-created simulation, but it must clearly avoid claiming that the simulation is an exact transcript.

---

## Proactive Coaching

The coach should be proactive.

It should analyze the learner’s state and recommend what to do next.

Examples:

* "Your main weakness is still expanding answers. Let’s do a controlled speaking drill."
* "You are making repeated preposition errors. I recommend a short reinforcement activity before advancing."
* "You passed the vocabulary section, but your production needs more natural phrasing."
* "Before moving to the next class, let’s correct this recurring grammar pattern."

The coach should motivate the learner and create a clear path forward.

---

## Non-Negotiable Rule

A class response must feel like a Cambridge-style teacher is teaching the learner.

It must never feel like:

* a metadata table;
* a dashboard report;
* a raw content dump;
* a book index;
* a placeholder response;
* a system diagnostic;
* a passive content viewer.

The learner must experience a lesson, not a data structure.

---

## Forbidden Outputs

Class responses must never contain:

* "Clase actual / contenido de clase"
* "viewing_current_class"
* "Extract exact grammar focus"
* "Extract exact"
* "Extract vocabulary"
* "Use the target language from the indexed page range"
* "anchored to Student Book pages"
* "Student Book page range" as a learner-facing class section
* "Do not infer unindexed wording"
* "recycle only confirmed unit vocabulary"

If any of these strings appear in a learner-facing lesson response, the implementation is incorrect.

---

## Hardcoding Policy

Do not hardcode behavior for:

* a specific unit;
* a specific class;
* a specific lesson;
* a specific page;
* a specific learner request;
* a specific book exercise.

Pedagogy must emerge from:

* learner context;
* class packs;
* lesson context;
* book structure;
* available resources;
* model reasoning.

Fix the source, prompt, retrieval, or routing.

Do not add unit-specific patches.

---

## UI Product Direction

The UI must support the experience of a teacher-led class.

It should not look or feel like a heavy dashboard.

Preferred structure:

* left side: navigation, current unit/class, materials, guides, progress, controls;
* right side: main chat/class experience.

Avoid:

* large top headers that steal vertical space;
* oversized chat bubbles;
* excessive spacing between messages;
* dashboard cards dominating the learning experience;
* token/cost information in learner-facing views;
* UI that makes the coach feel like a system log.

The chat should feel like an interactive class document with teacher guidance.

---

## Pedagogy Acceptance Criteria

Any implementation that affects lesson generation must pass these criteria.

A class request such as:

* "Dame la clase 4 de la unidad 1"
* "Dame la clase 1 de la unidad 2"
* "Dame la clase 2 de la unidad 4"

must generate a teacher-led lesson.

The response should normally contain:

* learner positioning;
* lesson identification;
* warm-up;
* teacher explanation;
* examples;
* controlled practice;
* vocabulary support;
* speaking or writing activity;
* evaluation gate.

The lesson must feel like a teacher is teaching.

The lesson must not feel like:

* a dashboard;
* a report;
* a metadata viewer;
* a content index;
* a raw retrieval result.

---

## Regression Tests

Every pedagogical change must be validated against at least:

* Unit 1 Class 4
* Unit 2 Class 1
* Unit 3 Class 1
* Unit 4 Class 2
* one review or checkpoint scenario

A change must be rejected if any response contains:

* "Clase actual / contenido de clase"
* "viewing_current_class"
* "Extract exact"
* "Extract vocabulary"
* "anchored to Student Book pages"
* "Use the target language from the indexed page range"

These outputs indicate that the learner is seeing implementation metadata instead of instruction.

---

## Recommended Automated Tests

Use multiple layers of testing.

### 1. Source / contract tests

Validate that class packs exist and contain usable teaching contracts.

### 2. API tests

Call the coach API with real class requests and validate the response.

Minimum test prompts:

* "Dame la clase 4 de la unidad 1"
* "Dame la clase 1 de la unidad 2"
* "Dame la clase 1 de la unidad 3"
* "Dame la clase 2 de la unidad 4"
* "Hazme un repaso de la unidad 1"

The API test must fail if forbidden outputs appear.

The API test should require teaching signals such as:

* "Warm-up"
* "Teacher explanation"
* "Examples"
* "Controlled practice"
* "Vocabulary"
* "Speaking"
* "Writing"
* "Evaluation gate"

depending on the class.

### 3. Playwright UI tests

Use Playwright to validate the learning experience.

UI tests should verify:

* the app loads;
* the coach page is usable;
* the left panel contains controls/materials/progress;
* the right panel contains the chat/class experience;
* there is no oversized top header;
* chat messages do not appear as huge bubbles;
* learner can type and send responses.

Playwright is useful for UI validation, but it is not sufficient for pedagogical quality.

Pedagogy must also be tested at the API and source-contract level.

---

## Development Rules

* Never push directly to `main`.
* Work in feature branches.
* Prefer `coach-pedagogy-restore` for current pedagogy recovery work.
* Add tests for every pedagogical regression.
* Run build before completion.
* Run automated tests before completion.
* Prefer fixing root causes over adding special cases.
* Never hardcode unit-specific teaching behavior.
* Never hardcode lesson-specific teaching behavior.
* Never expose implementation metadata to the learner.
* Do not merge to `main` without human review.

---

## Required Commands Before Completion

Before considering a task complete, run:

```bash
npm run build
npm run test:e2e
```

If a task changes pedagogy or class delivery, also ensure that source-contract and API-level regression tests pass.

---

## Pull Request Requirements

Every PR must include:

* summary of changes;
* files changed;
* tests added or updated;
* commands run;
* evidence that tests passed;
* notes about risks or unresolved issues.

Do not claim a fix is complete without test evidence.

---

## Current High-Risk Area

The class-delivery flow is high risk.

In previous iterations, class requests incorrectly returned metadata such as:

* "Clase actual / contenido de clase"
* "viewing_current_class"
* "Extract exact grammar focus"
* "Extract vocabulary"

Any future change must explicitly prevent this regression.

The correct behavior is a teacher-led English class using learner context, class packs, lesson context, Passages structure, examples, guided practice, and evaluation.
