import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { classifyCoachIntent, isGiveClassQuestion } from "../../src/lib/coachIntent";
import { getSavedPosition } from "../../src/modules/coach-context/coachContext";

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
  const classSystemPrompt = readFile("public/prompts/coach-route/class-system.md");
  const reviewSystemPrompt = readFile("public/prompts/coach-route/review-system.md");
  const generalSystemPrompt = readFile("public/prompts/coach-route/general-system.md");

  expect(publicRoute).toContain('export { coachPostSafe as POST } from "@/lib/coachRouteHandler"');
  expect(publicRoute).toContain("export const maxDuration = 120");
  expect(route).toContain("coachPostSafe");
  expect(handler).toContain("loadClassPack");
  expect(handler).toContain("Local Class Pack + Pedagogy Prompt");
  expect(handler).toContain("coachRoute.class.system");
  expect(classSystemPrompt).toContain("Never answer a class request with a metadata table");
  expect(handler).toContain("Unsafe class reply contains metadata marker");
  expect(handler).toContain("loadUnitTeachingContracts");
  expect(handler).toContain("Seven Local Teaching Contracts + Review Pedagogy Prompt");
  expect(handler).toContain("activeUnit: unit");
  expect(reviewSystemPrompt).toContain("Do not use the class-mode metadata header");
  expect(handler).toContain("sanitizeLearnerFacingReply");
  expect(generalSystemPrompt).toContain("never expose course-brand/source labels");
  expect(reviewSystemPrompt).toContain("finish with exactly four numbered checkpoint items");
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
  expect(classSystemPrompt).toContain("This response is the opening turn of a teacher-led class");
  expect(classSystemPrompt).toContain("Keep this opening turn under 280 words");
  expect(classSystemPrompt).toContain("strategic opening architecture");
  expect(handler).toContain('replace(/\\bviewing_current_class\\b/gi, "clase activa")');
  expect(classSystemPrompt).toContain('Never write "en modo ..." or any app-mode wording');
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
  const pageController = readFile("src/modules/coach-page/useCoachPageController.ts");
  const sessionContract = readFile("src/modules/coach-session/contract.ts");
  const viewModels = readFile("src/modules/coach-session/viewModels.ts");
  const topBar = readFile("src/modules/coach-layout/CoachTopBar.tsx");
  const studyPanel = readFile("src/modules/coach-resources/CoachStudyPanel.tsx");
  const learningPulsePanel = readFile("src/modules/coach-resources/CoachLearningPulsePanel.tsx");
  const guidesPanel = readFile("src/modules/coach-resources/CoachGuidesPanel.tsx");
  const quickHelpPanel = readFile("src/modules/coach-resources/CoachQuickHelpPanel.tsx");
  const materialsPanel = readFile("src/modules/coach-resources/CoachClassMaterialsPanel.tsx");
  const messageList = readFile("src/modules/coach-chat/CoachMessageList.tsx");
  const composer = readFile("src/modules/coach-chat/CoachComposer.tsx");
  const coachController = readFile("src/modules/coach-controller/coachController.ts");
  const apiClient = readFile("src/modules/coach-api/coachApiClient.ts");

  expect(pageController).toContain("const [coachSession, setCoachSession]");
  expect(pageController).toContain("const uiSession = resolveCoachUiSession");
  expect(pageController).toContain("createContextLoadedSession");
  expect(pageController).not.toContain('from "@/modules/coach-session/contract"');
  expect(pageController).toContain("const topBarModel = toCoachTopBarModel(uiSession, learningPulseLabel)");
  expect(pageController).toContain("const studyPanelModel = toCoachStudyPanelModel");
  expect(pageController).toContain("const learningPulsePanelModel = toCoachLearningPulsePanelModel");
  expect(pageController).toContain("const guidesPanelModel = toCoachGuidesPanelModel");
  expect(pageController).toContain("const quickHelpPanelModel = toCoachQuickHelpPanelModel");
  expect(pageController).toContain("const classMaterialsPanelModel = toCoachClassMaterialsPanelModel");
  expect(pageController).toContain("const chatMessageItems = messages.map");
  expect(pageController).toContain("const composerImage = selectedImage");
  expect(source).toContain("model={models.topBarModel}");
  expect(source).toContain("model={models.studyPanelModel}");
  expect(source).toContain("model={models.learningPulsePanelModel}");
  expect(source).toContain("model={models.guidesPanelModel}");
  expect(source).toContain("model={models.quickHelpPanelModel}");
  expect(source).toContain("model={models.classMaterialsPanelModel}");
  expect(source).toContain("<CoachMessageList");
  expect(source).toContain("<CoachComposer");
  expect(source).toContain("<CoachLearningPulsePanel");
  expect(source).toContain("<CoachGuidesPanel");
  expect(source).toContain("<CoachQuickHelpPanel");
  expect(source).toContain("<CoachClassMaterialsPanel");
  expect(viewModels).toContain("sessionHeaderDetail(session)");
  expect(viewModels).toContain("sessionLocationLabel(session)");
  expect(viewModels).toContain("sessionResourcesLabel(session)");
  expect(topBar).not.toContain("CoachSessionState");
  expect(topBar).not.toContain("sessionHeaderDetail");
  expect(topBar).not.toContain("sessionLocationLabel");
  expect(topBar).not.toContain("fetch(");
  expect(studyPanel).not.toContain("CoachSessionState");
  expect(studyPanel).not.toContain("sessionResourcesLabel");
  expect(studyPanel).not.toContain("fetch(");
  expect(messageList).not.toContain("CoachSessionState");
  expect(messageList).not.toContain("createCoachSessionContract");
  expect(messageList).not.toContain("fetch(");
  expect(composer).not.toContain("CoachSessionState");
  expect(composer).not.toContain("createCoachSessionContract");
  expect(composer).not.toContain("fetch(");
  for (const component of [learningPulsePanel, guidesPanel, quickHelpPanel, materialsPanel]) {
    expect(component).not.toContain("CoachSessionState");
    expect(component).not.toContain("createCoachSessionContract");
    expect(component).not.toContain("fetch(");
  }
  expect(materialsPanel).not.toContain("unitNumber");
  expect(materialsPanel).not.toContain("unitCode");
  expect(materialsPanel).not.toContain("provider");
  expect(quickHelpPanel).not.toContain("defaultPrompt");
  expect(guidesPanel).not.toContain("grammarWorkbookLoading");
  expect(guidesPanel).not.toContain("vocabularyWorkbookLoading");
  expect(composer).not.toContain("mimeType");
  expect(sessionContract).toContain("resourcesUnit");

  expect(pageController).toContain("resolveCoachResponseState");
  expect(pageController).toContain("const next = resolveCoachResponseState");
  expect(coachController).toContain("function inferCoordinatesFromReply");
  expect(coachController).toContain("const inferredCoordinates = inferCoordinatesFromReply(reply)");
  expect(coachController).toContain("const activeUnit = params.data.activeUnit || inferredCoordinates.unit");
  expect(pageController).toContain("normalizeUnitValue");
  expect(pageController).toContain("setStudyUnit(normalizeUnitValue(next.studyUnit))");
  expect(pageController).not.toContain("setCurrentUnit(unit);\n        setStudyUnit(unit)");
  expect(coachController).toContain("const studyMode: CoachStudyMode = isReviewRequest(params.requestMessage) ? \"review\" : isGuideRequest(params.requestMessage) ? \"guide\" : \"class\"");
  expect(pageController).toContain("setStudyMode(next.studyMode)");
  expect(pageController).toContain("setStudyClassNumber(next.studyClassNumber)");
  expect(studyPanel).toContain("Posición guardada:");
  expect(coachController).toContain("No pude completar la respuesta esta vez");
  expect(pageController).toContain("no inventes Class 1");
  expect(readFile("public/prompts/coach/start-current-class.md")).toContain("apertura estratégica por etapas");
  expect(source).not.toContain("finish with an evaluation gate before progress can advance");
  expect(pageController).toContain("createCoachApiClient");
  expect(source).not.toContain("readJsonResponse(response)");
  expect(source).not.toContain("fetch(");
  expect(pageController).not.toContain("fetch(");
  expect(apiClient).toContain("readJsonResponse(response)");
  expect(apiClient).toContain("El servidor no devolvió contenido");
});

test("mobile coach header keeps mode and unit/class visible", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const topBar = readFile("src/modules/coach-layout/CoachTopBar.tsx");
  const viewModels = readFile("src/modules/coach-session/viewModels.ts");
  const globals = readFile("src/app/globals.css");
  const overrides = readFile("src/app/coach-qa-overrides.css");

  expect(source).toContain("<CoachTopBar");
  expect(topBar).toContain("coach-status-detail");
  expect(topBar).toContain("model.detailLabel");
  expect(viewModels).toContain("sessionHeaderDetail(session)");
  expect(globals).toContain(".coach-status-detail");
  expect(overrides).toContain(".coach-status-detail");
  expect(globals).not.toContain("span:not(.coach-status-brand)");
  expect(overrides).not.toContain("span:not(.coach-status-brand)");
});

test("coach shows an evidence-based learning pulse without inventing progress", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const pageController = readFile("src/modules/coach-page/useCoachPageController.ts");
  const contextController = readFile("src/modules/coach-context/coachContext.ts");
  const topBar = readFile("src/modules/coach-layout/CoachTopBar.tsx");
  const learningPulsePanel = readFile("src/modules/coach-resources/CoachLearningPulsePanel.tsx");
  const globals = readFile("src/app/globals.css");

  expect(contextController).toContain("export type CoachLearningPulse");
  expect(contextController).toContain("function buildLearningPulse");
  expect(contextController).toContain("function readableProgressValue");
  expect(contextController).toContain("typeof value === \"object\"");
  expect(contextController).toContain("\"nextAction\"");
  expect(contextController).toContain("\"mistake\"");
  expect(contextController).toContain("function learningPulseDetail");
  expect(contextController).toContain("Sin nivel confirmado");
  expect(contextController).toContain("sin evidencias");
  expect(pageController).toContain("buildLearningPulse");
  expect(pageController).toContain("learningPulseDetail");
  expect(topBar).toContain("coach-status-pulse");
  expect(source).toContain("<CoachLearningPulsePanel");
  expect(learningPulsePanel).toContain("coach-learning-pulse");
  expect(learningPulsePanel).toContain("Tu avance");
  expect(learningPulsePanel).toContain("practiceCount");
  expect(source).not.toContain("2/4");
  expect(globals).toContain(".coach-learning-pulse-grid");
  expect(globals).toContain(".coach-status-pulse");
});

test("mobile sidebar keeps class resources visible after the learning pulse", async () => {
  const source = readFile("src/app/coach/page.tsx");
  const learningPulsePanel = readFile("src/modules/coach-resources/CoachLearningPulsePanel.tsx");
  const materialsPanel = readFile("src/modules/coach-resources/CoachClassMaterialsPanel.tsx");
  const globals = readFile("src/app/globals.css");
  const overrides = readFile("src/app/coach-qa-overrides.css");

  expect(source).toContain("<CoachLearningPulsePanel");
  expect(source).toContain("<CoachClassMaterialsPanel");
  expect(learningPulsePanel).toContain("Tu avance");
  expect(materialsPanel).toContain("Materiales de clase");
  expect(globals).toContain("#coach-sidebar > section:nth-of-type(4)");
  expect(overrides).toContain("#coach-sidebar > section:nth-of-type(4)");
  expect(globals).not.toContain("#coach-sidebar > section:nth-of-type(n + 3)");
  expect(overrides).not.toContain("#coach-sidebar > section:nth-of-type(n + 3)");
});

test("unit grammar and vocabulary guides use verified unit contracts", async () => {
  const handler = readFile("src/lib/coachRouteHandler.ts");
  const source = readFile("src/app/coach/page.tsx");
  const pageController = readFile("src/modules/coach-page/useCoachPageController.ts");
  const grammarGuidePrompt = readFile("public/prompts/coach/unit-grammar-guide.md");

  expect(handler).toContain("function unitGuideKind");
  expect(handler).toContain("buildUnitGuideInput");
  expect(handler).toContain("coachRoute.unitGuide.user");
  expect(handler).toContain("coachRoute.unitGuide.system");
  expect(readFile("public/prompts/coach-route/unit-guide-user.md")).toContain("VERIFIED TEACHING CONTRACTS FOR ALL SEVEN CLASSES");
  expect(readFile("public/prompts/coach-route/unit-guide-system.md")).toContain("Do not ask the learner for the class index");
  expect(readFile("public/prompts/coach-route/unit-guide-system.md")).toContain("Do not mention Passages");
  expect(handler).toContain("renderUnitGuideReply");
  expect(source).toContain("onRequestGrammarGuide={actions.requestUnitGrammar}");
  expect(pageController).toContain("coach.unitGrammarGuide");
  expect(grammarGuidePrompt).toContain("No menciones Passages ni pidas el índice.");
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
  const targetResolver = readFile("src/modules/coach-target/resolve.ts");
  const classBranchStart = handler.indexOf("if (isGiveClassQuestion(message))");
  const reviewBranchStart = handler.indexOf("if (isReviewQuestion(message))", classBranchStart);
  const classBranch = handler.slice(classBranchStart, reviewBranchStart);

  expect(targetResolver).toContain("function collectStrings");
  expect(targetResolver).toContain("resolveClassCoordinatesFromPayload");
  expect(handler).toContain("resolveClassTargetFromMessage");
  expect(classBranch).toContain('callEnglishOSAction("getCurrentClassContent"');
  expect(classBranch).toContain("mergeClassTargetWithPayload(target, activeClassContent)");
  expect(classBranch.indexOf('callEnglishOSAction("getCurrentClassContent"')).toBeLessThan(classBranch.indexOf("Current Class Clarification"));
});

test("saved position uses unit and lesson from the same context source", async () => {
  const source = readFile("src/modules/coach-context/coachContext.ts");
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
  expect(renderer).toContain('Hoy trabajaremos **${reference}**.');
  expect(renderer).toContain('Focus: **${formattedSkillFocus}**');
  expect(renderer).toContain('Empezamos con **${identity.sections.split("+")[0]?.trim() || displayLesson}**.');
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
  expect(readFile("public/prompts/coach-route/class-system.md")).toContain("The application renders learner position and lesson identity");
  expect(handler).toContain("encontré tu clase activa en English OS");
  expect(handler).toContain("Trabajaremos con **${target}**.");
  expect(handler).toContain("const explicitClassRule");
  expect(handler).toContain("Teach the requested unit and class even if the saved English OS position is different");
  expect(handler).toContain('do not offer \\"continue my current class\\" alternatives');
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
  const classSystemPrompt = readFile("public/prompts/coach-route/class-system.md");

  expect(handler).toContain("PREMATURE_CLASS_CLOSURE");
  expect(classSystemPrompt).toContain("Do not include the evaluation gate, recap, achievement, weakness");
  expect(behavior).toContain("SESSION CLOSING — ONLY AFTER LEARNER EVIDENCE");
  expect(behavior).toContain("Never claim that a session was logged unless");
  expect(behavior).toContain("only after confirmed success");
  expect(behavior).toContain("Teacher reaction");
  expect(behavior).toContain("Use 👍 when the answer is clearly correct or strong");
  expect(readFile("public/prompts/coach-route/general-system.md")).toContain("Cambridge-style correction");
});

test("saved position prefers current class state over stale user unit", async () => {
  expect(getSavedPosition({
    context: {
      user: {
        "Current Unit": "Unit 1",
        "Current Lesson": "Old lesson",
      },
      learningState: {
        currentUnit: "Unit 4",
        currentClass: 28,
      },
      currentClassIndex: {
        unit: "Unit 4",
        classNumber: 28,
        lesson: "Business advice speaking practice: expanding advice with contrast",
      },
    },
  })).toEqual({
    unit: "Unit 4",
    lesson: "Business advice speaking practice: expanding advice with contrast",
    classNumber: 28,
  });
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
  const visualVocabularyPrompt = await fs.readFile("public/prompts/coach-route/visual-vocabulary-system.md", "utf8");

  expect(source).toContain("type CoachImageAttachment");
  expect(source).toContain("buildVisualVocabularyInput");
  expect(source).toContain("Ephemeral Visual Vocabulary Analysis");
  expect(source).toContain("coachRoute.visualVocabulary.system");
  expect(visualVocabularyPrompt).toContain("Do not claim the image was stored");
  expect(visualVocabularyPrompt).toContain("Do not log progress");
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
