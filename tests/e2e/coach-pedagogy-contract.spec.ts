import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { classifyCoachIntent, isGiveClassQuestion } from "../../src/lib/coachIntent";

// Validation scope: UI shell + source contracts + pedagogy-first coach routing.
const root = process.cwd();
const packsRoot = path.join(root, "knowledge", "class-packs-lesson-vision");
const promptFile = path.join(root, "src", "lib", "passagesTeacherStyle.ts");

function readFile(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readPack(filename: string) {
  return fs.readFileSync(path.join(packsRoot, filename), "utf8");
}

function activeContract(source: string) {
  const marker = "### Active class teaching contract";
  const start = source.indexOf(marker);
  const end = source.indexOf("### Safety rule", start);
  return start >= 0 ? source.slice(start, end >= 0 ? end : undefined) : "";
}

test("teacher prompt keeps the general pedagogy workflow", async () => {
  const source = fs.readFileSync(promptFile, "utf8");
  const required = [
    "runtime learner context",
    "84 class packs",
    "complete lesson context",
    "Warm-up",
    "Teacher explanation",
    "Controlled practice",
    "Role play",
    "Writing",
    "Evaluation gate",
    "Cambridge-style correction",
    "CEFR",
  ];

  for (const item of required) expect(source).toContain(item);
  expect(source).not.toContain("Critical correction for Unit");
  expect(source).toContain("Cohesive lesson thread");
  expect(source).toContain("Review-mode architecture");
  expect(source).toContain("Never show Global Class numbers");
  expect(source).toContain("Never attribute a teacher-created simulation");
  expect(source).toContain("Start with one short teacher reaction");
  expect(source).toContain("Almost there — keep going");
});

test("coach API routes class requests to the pedagogy-first handler", async () => {
  const publicRoute = readFile("src/app/api/english-os/coach/route.ts");
  const route = readFile("src/app/api/english-os/coach-pedagogy/route.ts");
  const handler = readFile("src/lib/coachRouteHandler.ts");

  expect(publicRoute).toContain('export { coachPostSafe as POST } from "@/lib/coachRouteHandler"');
  expect(publicRoute).toContain("export const maxDuration = 120");
  expect(route).toContain("coachPostSafe");
  expect(handler).toContain("loadClassPack");
  expect(handler).toContain("Local Class Pack + Pedagogy Prompt");
  expect(handler).toContain("Never answer a class request with a metadata table");
  expect(handler).toContain("Unsafe class reply contains metadata marker");
  expect(handler).toContain("loadUnitTeachingContracts");
  expect(handler).toContain("Seven Local Teaching Contracts + Review Pedagogy Prompt");
  expect(handler).toContain("activeUnit: unit");
  expect(handler).toContain("Do not use the class-mode metadata header");
  expect(handler).toContain("sanitizeLearnerFacingReply");
  expect(handler).toContain("never expose course-brand/source labels");
  expect(handler).toContain("finish with exactly four numbered checkpoint items");
  expect(handler).toContain("deterministicIdentity: true");
  expect(handler).toContain("renderClassReply");
  expect(handler).toContain("renderReviewReply");
  expect(handler).toContain("stripModelOwnedIdentity");
  expect(handler).toContain("assertCompleteModelResponse");
  expect(handler).toContain("OPENAI_COACH_MAX_OUTPUT_TOKENS || 8000");
  expect(handler).toContain("OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS || 12000");
  expect(handler).toContain("callCompleteCoachModel");
  expect(handler).toContain("incomplete model response; retrying");
  expect(handler).toContain("request failed");
  expect(handler).toContain("using development-only learner context");
  expect(handler).toContain("localValidationMode: true");
  expect(handler).toContain('process.env.NODE_ENV === "development"');
  expect(handler).toContain("limitToOpeningClassTurn");
  expect(handler).toContain("stripPrematureClassClosure");
  expect(handler).toContain("This response is the opening turn of a teacher-led class");
  expect(handler).toContain("Keep this opening turn under 280 words");
  expect(handler).toContain("strategic opening architecture");
  expect(handler).toContain("no inventar **Class 1**");
  expect(handler).toContain("openingSectionInstruction");
  expect(handler).toContain("Activate the topic only");
  expect(handler).toContain("Do not teach grammar rules, structure tables, or vocabulary lists yet");

  const forbiddenLegacyClassDelivery = [
    "formatCurrentClassContentReply",
    "Clase actual / contenido de clase",
    "Book Content Index",
  ];
  for (const marker of forbiddenLegacyClassDelivery) expect(publicRoute).not.toContain(marker);
});

test("coach UI follows the explicitly requested unit for materials", async () => {
  const source = readFile("src/app/coach/page.tsx");
  expect(source).toContain("data.activeUnit ? `Unit ${data.activeUnit}`");
  expect(source).toContain("normalizeUnitValue");
  expect(source).toContain("setStudyUnit(normalizeUnitValue(unit))");
  expect(source).not.toContain("setCurrentUnit(unit);\n        setStudyUnit(unit)");
  expect(source).toContain("const nextMode: StudyMode = isReviewRequest(message) ? \"review\" : isGuideRequest(message) ? \"guide\" : \"class\"");
  expect(source).toContain("setStudyMode(nextMode)");
  expect(source).toContain("setStudyClassNumber(data.activeClass && nextMode === \"class\" ? Number(data.activeClass) : null)");
  expect(source).toContain("Posición guardada:");
  expect(source).toContain("No pude completar la respuesta esta vez");
  expect(source).toContain("no inventes Class 1");
  expect(source).toContain("apertura estratégica por etapas");
  expect(source).not.toContain("finish with an evaluation gate before progress can advance");
  expect(source).toContain("readJsonResponse(response)");
  expect(source).toContain("El servidor no devolvió contenido");
});

test("mobile coach header keeps mode and unit/class visible", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const globals = readFile("src/app/globals.css");
  const overrides = readFile("src/app/coach-qa-overrides.css");

  expect(source).toContain("coach-status-detail");
  expect(source).toContain("{studyModeLabel(studyMode)} · {activeLocationLabel}");
  expect(globals).toContain(".coach-status-detail");
  expect(overrides).toContain(".coach-status-detail");
  expect(globals).not.toContain("span:not(.coach-status-brand)");
  expect(overrides).not.toContain("span:not(.coach-status-brand)");
});

test("coach shows an evidence-based learning pulse without inventing progress", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const globals = readFile("src/app/globals.css");

  expect(source).toContain("type LearningPulse");
  expect(source).toContain("function buildLearningPulse");
  expect(source).toContain("function readableProgressValue");
  expect(source).toContain("typeof value === \"object\"");
  expect(source).toContain("\"nextAction\"");
  expect(source).toContain("\"mistake\"");
  expect(source).toContain("function learningPulseDetail");
  expect(source).toContain("Sin nivel confirmado");
  expect(source).toContain("sin evidencias");
  expect(source).toContain("coach-status-pulse");
  expect(source).toContain("coach-learning-pulse");
  expect(source).toContain("Tu avance");
  expect(source).toContain("learningPulse.practiceCount");
  expect(source).not.toContain("2/4");
  expect(globals).toContain(".coach-learning-pulse-grid");
  expect(globals).toContain(".coach-status-pulse");
});

test("mobile sidebar keeps class resources visible after the learning pulse", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const globals = readFile("src/app/globals.css");
  const overrides = readFile("src/app/coach-qa-overrides.css");

  expect(source).toContain("Tu avance");
  expect(source).toContain("Materiales de clase");
  expect(globals).toContain("#coach-sidebar > section:nth-of-type(4)");
  expect(overrides).toContain("#coach-sidebar > section:nth-of-type(4)");
  expect(globals).not.toContain("#coach-sidebar > section:nth-of-type(n + 3)");
  expect(overrides).not.toContain("#coach-sidebar > section:nth-of-type(n + 3)");
});

test("unit grammar and vocabulary guides use verified unit contracts", async () => {
  const handler = readFile("src/lib/coachRouteHandler.ts");
  const source = readFile("src/app/coach/page.tsx");

  expect(handler).toContain("function unitGuideKind");
  expect(handler).toContain("buildUnitGuideInput");
  expect(handler).toContain("VERIFIED TEACHING CONTRACTS FOR ALL SEVEN CLASSES");
  expect(handler).toContain("Do not ask the learner for the class index");
  expect(handler).toContain("Do not mention Passages");
  expect(handler).toContain("renderUnitGuideReply");
  expect(source).toContain("No menciones Passages ni pidas el índice.");
});

test("explicit unit and class switches always use class delivery", async () => {
  const classRequests = [
    "Ahora la clase 1 de la unidad 4",
    "Unidad 4, clase 1",
    "Cambiemos a la unidad 4 clase 1",
    "Let's switch to Unit 4 Class 1",
    "Dame clase 1 de unidad 4",
    "Dame la clase 1 de la unidad 5",
    "Start Unit 5, Class 1",
    "posiciona mi clase a partir de hoy en la unidad 2, clase 1",
    "actualiza mi clase a Unit 2 Class 1",
    "Empecemos clase",
    "Dame la clase",
    "Ahora vamos a modo clase",
    "Vamos a modo clase",
    "Switch to class mode",
    "Abramos mi clase de hoy",
    "Continuemos donde voy",
    "Sigamos con mi clase actual",
    "Quiero empezar mi lesson guardada",
    "Open my current class",
    "Resume today's lesson",
  ];
  for (const request of classRequests) expect(isGiveClassQuestion(request), request).toBe(true);

  expect(isGiveClassQuestion("Hazme un repaso de la unidad 4 clase 1")).toBe(false);
  expect(isGiveClassQuestion("¿Qué gramática tiene la unidad 4?")).toBe(false);
});

test("coach intent resolver classifies natural request families instead of exact phrases", async () => {
  const activeClassRequests = [
    "Ahora vamos a modo clase",
    "Arranquemos",
    "Dale, empecemos",
    "Quiero estudiar",
    "Que toca hoy?",
    "Abre mi sesion de hoy",
    "Continua donde quedamos",
    "Let's study",
    "Open today's lesson",
  ];
  for (const request of activeClassRequests) {
    expect(classifyCoachIntent(request), request).toMatchObject({ kind: "active_class" });
    expect(isGiveClassQuestion(request), request).toBe(true);
  }

  const specificClassRequests = [
    "Dame la clase 1 de la unidad 5",
    "Start Unit 5, Lesson 1",
    "Cambiemos a Unit 2 Class 3",
  ];
  for (const request of specificClassRequests) {
    expect(classifyCoachIntent(request), request).toMatchObject({ kind: "specific_class" });
    expect(isGiveClassQuestion(request), request).toBe(true);
  }

  expect(classifyCoachIntent("Hazme un repaso de la unidad 4 clase 1")).toMatchObject({ kind: "review" });
  expect(classifyCoachIntent("Dame una guia de gramatica de la unidad 4")).toMatchObject({ kind: "grammar_guide" });
  expect(classifyCoachIntent("Dame una guia de vocabulario de Unit 4")).toMatchObject({ kind: "vocabulary_guide" });
});

test("ambiguous active class requests consult English OS current class before clarification", async () => {
  const handler = readFile("src/lib/coachRouteHandler.ts");
  const classBranchStart = handler.indexOf("if (isGiveClassQuestion(message))");
  const reviewBranchStart = handler.indexOf("if (isReviewQuestion(message))", classBranchStart);
  const classBranch = handler.slice(classBranchStart, reviewBranchStart);

  expect(handler).toContain("function coordinatesFromPayload");
  expect(classBranch).toContain('callEnglishOSAction("getCurrentClassContent"');
  expect(classBranch).toContain("coordinatesFromPayload(activeClassContent");
  expect(classBranch.indexOf('callEnglishOSAction("getCurrentClassContent"')).toBeLessThan(classBranch.indexOf("Current Class Clarification"));
});

test("saved position uses unit and lesson from the same context source", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const start = source.indexOf("function getSavedPosition");
  const end = source.indexOf("function firstProgressValue", start);
  const getSavedPositionSource = source.slice(start, end);

  expect(getSavedPositionSource).toContain("const sources = [");
  expect(getSavedPositionSource).toContain("const pairedSource = sources.find");
  expect(getSavedPositionSource).toContain("unit: String(pairedSource.unit");
  expect(getSavedPositionSource).toContain("lesson: String(pairedSource.lesson");
  expect(getSavedPositionSource).not.toContain("recommended.lesson ||\n      recommended.currentLesson ||\n      current.lesson");
});

test("all 84 class packs expose usable learner-safe teaching contracts", async () => {
  const filenames = fs.readdirSync(packsRoot).filter((filename) => filename.endsWith(".md")).sort();
  expect(filenames).toHaveLength(84);

  const requiredFields = [
    "Active class section names",
    "Active class grammar focus",
    "Active class vocabulary focus",
    "Active class target structures",
    "Expected learner production",
  ];
  const forbidden = [
    "Extract exact",
    "Extract vocabulary",
    "Use the target language from the indexed page range",
    "anchored to Student Book pages",
    "viewing_current_class",
  ];

  for (const filename of filenames) {
    const contract = activeContract(readPack(filename));
    expect(contract, filename).toContain("Active class teaching contract");
    for (const field of requiredFields) expect(contract, `${filename}: ${field}`).toContain(field);
    for (const marker of forbidden) expect(contract, `${filename}: ${marker}`).not.toContain(marker);
  }
});

test("five sampled class packs keep active source contracts", async () => {
  const samples = [
    ["unit-01-local-class-01-global-class-01-class-pack-unit-01-class-01.md", ["Starting point", "Vocabulary & Speaking", "Grammar", "Speaking"], ["gerunds", "personality"]],
    ["unit-01-local-class-04-global-class-04-class-pack-unit-01-class-04.md", ["Starting point", "Listening & Speaking", "Grammar", "Discussion"], ["noun clauses after be", "family"]],
    ["unit-02-local-class-01-global-class-08-class-pack-unit-02-class-08.md", ["Starting point", "Listening", "Grammar", "Discussion"], ["should have", "life lessons"]],
    ["unit-03-local-class-01-global-class-15-class-pack-unit-03-class-15.md", ["Starting point", "Listening"], ["adjective clauses", "cities"]],
    ["unit-04-local-class-02-global-class-23-class-pack-unit-04-class-23.md", ["Listening & Speaking", "Role Play", "Writing"], ["Giving advice", "Effective topic sentences"]],
  ] as const;

  for (const [filename, sections, focusTerms] of samples) {
    const source = readPack(filename);
    const contract = activeContract(source);

    expect(contract, filename).toContain("Active class teaching contract");
    expect(source, filename).toContain("## Extracted Student Book content");
    expect(source, filename).toContain("Exact retrieval key");

    for (const section of sections) expect(contract, `${filename} section ${section}`).toContain(section);
    for (const term of focusTerms) expect(source, `${filename} focus ${term}`).toContain(term);
  }
});

test("Unit 1 Class 2 keeps the full lesson title and treats Changes as an activity focus", async () => {
  const source = readPack("unit-01-local-class-02-global-class-02-class-pack-unit-01-class-02.md");
  const contract = activeContract(source);

  expect(contract).toContain("Lesson title: What kind of person are you?");
  expect(contract).toContain("Listening + Discussion + Writing");
  expect(contract).toContain("not grammar-centered");
  expect(source).toContain("LISTENING");
  expect(source).toContain("Changes");
});

test("Unit 4 Class 2 keeps Chilling out separate from the unit theme", async () => {
  const source = readPack("unit-04-local-class-02-global-class-23-class-pack-unit-04-class-23.md");
  const contract = activeContract(source);

  expect(contract).toContain("Lesson title: Chilling out");
  expect(contract).toContain("Listening & Speaking + Role Play + Writing");
  expect(contract).toContain("stress; fatigue; lack of energy");
  expect(contract).toContain("effective topic sentences");
  expect(contract).not.toContain("positive messages");
  expect(contract).not.toContain("sleepiness is at its peak");
  expect(source).toContain("Early birds and night owls");
});

test("application-owned identity precedes model-authored teaching", async () => {
  const handler = readFile("src/lib/coachRouteHandler.ts");
  const rendererStart = handler.indexOf("function renderClassReply");
  const rendererEnd = handler.indexOf("function renderReviewReply");
  const renderer = handler.slice(rendererStart, rendererEnd);

  expect(renderer).toContain("const teachingBody = ensureMinimumOpeningTask");
  expect(renderer).toContain("stripClassConfirmationDetours(limitToOpeningClassTurn(stripModelOwnedIdentity(params.body), identity.sections))");
  expect(renderer).toContain('return readableMarkdownPunctuation(sanitizeLearnerFacingReply([params.position, "", ...header, "", teachingBody]');
  expect(renderer).toContain('`# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""}`)}`');
  expect(handler).toContain("function readableMarkdownPunctuation");
  expect(handler).toContain("function ensureTerminalPeriod");
  expect(handler).toContain("Learning objective|Communication mission");
  expect(handler).toContain("?::\\*\\*|\\*\\*:|:");
  expect(renderer).toContain('Current target: **${reference}**.');
  expect(renderer).toContain('Focus: **${formattedSkillFocus}**');
  expect(renderer).toContain('First micro-step: **${identity.sections.split("+")[0]?.trim() || displayLesson}**.');
  expect(renderer).toContain("learnerFriendlyFocus");
  expect(renderer).toContain("ensureMinimumOpeningTask");
  expect(handler).toContain("Let’s start with a short prediction before watching");
  expect(renderer).not.toContain("const courseReference");
  expect(renderer).not.toContain("bookPages");
  expect(renderer).not.toContain("pdfPages");
  expect(renderer).not.toContain("Book ${");
  expect(renderer).not.toContain("PDF ${");
  expect(handler).toContain("not grammar-centered");
  expect(handler).toContain("Book pages:|PDF pages:");
  expect(handler).toContain("The application renders learner position and lesson identity");
  expect(handler).toContain("encontré tu clase activa en English OS");
  expect(handler).toContain("Trabajaremos con **${target}**.");
  expect(handler).toContain("Explicit class request wins");
  expect(handler).toContain("Teach the requested unit and class even if the saved English OS position is different");
  expect(handler).toContain('do not offer "continue my current class" alternatives');
  expect(handler).toContain("stripClassConfirmationDetours");
  expect(handler).toContain("current english os position is different");
  expect(handler).toContain("without your confirmation");
  expect(handler).toContain("continue my current class");
  expect(handler).toContain("found your (?:saved|current) (?:position|english os position)");
  expect(handler).toContain("you asked for\\s+unit\\s+\\d+");
  expect(handler).toContain(".replace(/\\bPassages\\s+Level\\s+\\d+\\s*[-—]\\s*/gi, \"\")");
  expect(handler).not.toContain("For this request, the active learning target is");
  expect(handler).toContain("/\\bclass pack\\b/i");
});

test("all classes display the canonical curriculum unit name", async () => {
  const titles = JSON.parse(readFile("knowledge/passages-unit-titles.json"));
  const handler = readFile("src/lib/coachRouteHandler.ts");

  expect(Object.keys(titles.units)).toHaveLength(12);
  expect(titles.units[2]).toBe("Mistakes and mysteries");
  expect(titles.units[3]).toBe("Exploring new cities");
  expect(titles.units[4]).toBe("Early birds and night owls");
  expect(handler).toContain("passages-unit-titles.json");
  expect(handler).toContain("const displayLesson = identity.lessonTitle || identity.sections.split");
});

test("class opening cannot invent evaluation or logging results", async () => {
  const handler = readFile("src/lib/coachRouteHandler.ts");
  const behavior = readFile("src/lib/englishOsCoachPrompt.ts");

  expect(handler).toContain("PREMATURE_CLASS_CLOSURE");
  expect(handler).toContain("Do not include the evaluation gate, recap, achievement, weakness");
  expect(behavior).toContain("SESSION CLOSING — ONLY AFTER LEARNER EVIDENCE");
  expect(behavior).toContain("Never claim that a session was logged unless");
  expect(behavior).toContain("only after confirmed success");
  expect(behavior).toContain("Teacher reaction");
  expect(behavior).toContain("Use 👍 when the answer is clearly correct or strong");
  expect(handler).toContain("Cambridge-style correction");
});

test("UTF-8 integrity is enforced before every build", async () => {
  const packageJson = readFile("package.json");
  const encodingCheck = readFile("scripts/check-text-encoding.mjs");
  const files = [
    "src/lib/coachRouteHandler.ts",
    "src/lib/passagesTeacherStyle.ts",
    "src/lib/englishOsCoachPrompt.ts",
    "src/app/coach/page.tsx",
  ].map(readFile);
  const forbidden = [
    String.fromCodePoint(0x00e2, 0x20ac, 0x201d),
    String.fromCodePoint(0x00e2, 0x20ac, 0x0153),
    String.fromCodePoint(0x00e2, 0x20ac, 0x2122),
    String.fromCodePoint(0x00c2, 0x00b7),
    String.fromCodePoint(0xfffd),
  ];

  expect(packageJson).toContain('"build": "npm run check:encoding && next build"');
  expect(encodingCheck).toContain("Encoding check failed");
  for (const source of files) {
    for (const marker of forbidden) expect(source).not.toContain(marker);
  }
});

test("visual vocabulary image analysis is ephemeral and learner-safe", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("src/lib/coachRouteHandler.ts", "utf8");

  expect(source).toContain("type CoachImageAttachment");
  expect(source).toContain("buildVisualVocabularyInput");
  expect(source).toContain("Ephemeral Visual Vocabulary Analysis");
  expect(source).toContain("Do not claim the image was stored");
  expect(source).toContain("Do not log progress");
  expect(source).toContain("input_image");
  expect(source).toContain("Unsupported image format");
});

test("contract generation and audit preserve the complete lesson title", async () => {
  const generator = readFile("scripts/generate-passages-teaching-contracts.mjs");
  const audit = readFile("scripts/audit-passages-contracts.mjs");

  expect(generator).toContain("canonicalLessonTitle");
  expect(generator).toContain("Never promote an activity, subsection, listening, reading, or writing heading");
  expect(audit).toContain("does not match full lesson title");
});
