import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { classifyCoachIntent, isGiveClassQuestion } from "../../src/lib/coachIntent";
import { getSavedPosition } from "../../src/modules/coach-context/coachContext";
import { renderClassReply } from "../../src/modules/coach-delivery/replyRendering";
import { buildTeachingContractV2 } from "../../src/modules/coach-delivery/teachingContractV2";

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

const poorTeachingTemplatePhrases = [
  "Today we will use this lesson to",
  "I can use **",
  "Focus on the form, the meaning, and one natural use",
  "Use **one useful word** in a complete sentence",
  "It is useful to give one clear reason when you speak",
  "Using a short example makes your answer easier to understand",
];

function expectNoPoorTeachingTemplate(reply: string) {
  for (const phrase of poorTeachingTemplatePhrases) expect(reply).not.toContain(phrase);
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
  const modelClient = readFile("src/modules/coach-route/modelClient.ts");
  const replyRendering = readFile("src/modules/coach-delivery/replyRendering.ts");
  const teachingContracts = readFile("src/modules/coach-delivery/teachingContracts.ts");
  const targetApplication = readFile("src/modules/coach-target/application.ts");
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
  expect(replyRendering).toContain("Unsafe class reply contains metadata marker");
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
  expect(replyRendering).toContain("stripModelOwnedIdentity");
  expect(modelClient).toContain("assertCompleteModelResponse");
  expect(modelClient).toContain("OPENAI_COACH_MAX_OUTPUT_TOKENS || 8000");
  expect(modelClient).toContain("OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS || 12000");
  expect(handler).toContain("callCompleteCoachModel");
  expect(modelClient).toContain("incomplete model response; retrying");
  expect(handler).toContain("request failed");
  expect(handler).toContain("using development-only learner context");
  expect(handler).toContain("localValidationMode: true");
  expect(handler).toContain('process.env.NODE_ENV === "development"');
  expect(replyRendering).toContain("guidedOpeningFallback");
  expect(replyRendering).toContain("stripPrematureClassClosure");
  expect(classSystemPrompt).toContain("This response is the opening turn of a teacher-led class");
  expect(classSystemPrompt).toContain("first learning block");
  expect(classSystemPrompt).toContain("strategic opening architecture");
  expect(replyRendering).toContain('replace(/\\bviewing_current_class\\b/gi, "clase activa")');
  expect(classSystemPrompt).toContain('Never write "en modo ..." or any app-mode wording');
  expect(targetApplication).toContain("no inventar **Class 1**");
  expect(handler).toContain("openingSectionInstruction");
  expect(teachingContracts).toContain("openingLearningBlockInstruction");
  expect(readFile("src/modules/coach-delivery/pedagogicalDeliveryPolicy.ts")).toContain("Teach the first learning block, not only the first heading");

  const forbiddenLegacyClassDelivery = [
    "formatCurrentClassContentReply",
    "Clase actual / contenido de clase",
    "Book Content Index",
  ];
  for (const marker of forbiddenLegacyClassDelivery) expect(publicRoute).not.toContain(marker);
});

test("coach UI follows the explicitly requested unit for materials", async () => {
  const source = [
    readFile("src/app/coach/page.tsx"),
    readFile("src/modules/coach-page/CoachPageView.tsx"),
    readFile("src/modules/coach-page/CoachSidebarView.tsx"),
    readFile("src/modules/coach-page/CoachChatView.tsx"),
  ].join("\n");
  const pageController = readFile("src/modules/coach-page/useCoachPageController.ts");
  const learningActions = readFile("src/modules/coach-learning-actions/application.ts");
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
  const coachMessageApplication = readFile("src/modules/coach-message/application.ts");
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
  expect(source).toContain("model={viewModel.topBar}");
  expect(source).toContain("model={viewModel.study}");
  expect(source).toContain("model={viewModel.learningPulse}");
  expect(source).toContain("model={viewModel.guides}");
  expect(source).toContain("model={viewModel.quickHelp}");
  expect(source).toContain("model={viewModel.materials}");
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
  expect(pageController).toContain('from "@/modules/coach-message/application"');
  expect(coachController).toContain('from "@/modules/coach-message/application"');
  expect(coachMessageApplication).toContain("function inferCoordinatesFromReply");
  expect(coachMessageApplication).toContain("const inferredCoordinates = inferCoordinatesFromReply(reply)");
  expect(coachMessageApplication).toContain("const activeUnit = params.data.activeUnit || inferredCoordinates.unit");
  expect(pageController).toContain("normalizeUnitValue");
  expect(pageController).toContain("setStudyUnit(normalizeUnitValue(next.studyUnit))");
  expect(pageController).not.toContain("setCurrentUnit(unit);\n        setStudyUnit(unit)");
  expect(coachMessageApplication).toContain("const studyMode: CoachStudyMode = isReviewRequest(params.requestMessage) ? \"review\" : isGuideRequest(params.requestMessage) ? \"guide\" : \"class\"");
  expect(pageController).toContain("setStudyMode(next.studyMode)");
  expect(pageController).toContain("setStudyClassNumber(next.studyClassNumber)");
  expect(studyPanel).toContain("Posición guardada:");
  expect(coachMessageApplication).toContain("No pude completar la respuesta esta vez");
  expect(learningActions).toContain("no inventes Class 1");
  expect(pageController).toContain("buildStartTodayClassMessage");
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
  const source = readFile("src/modules/coach-page/CoachPageView.tsx");
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
  const source = readFile("src/modules/coach-page/CoachSidebarView.tsx");
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
  expect(contextController).toContain("Nivel aún por confirmar");
  expect(contextController).toContain("Aún necesito evidencia");
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
  const source = readFile("src/modules/coach-page/CoachSidebarView.tsx");
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
  const source = readFile("src/modules/coach-page/CoachSidebarView.tsx");
  const pageController = readFile("src/modules/coach-page/useCoachPageController.ts");
  const learningActions = readFile("src/modules/coach-learning-actions/application.ts");
  const grammarGuidePrompt = readFile("public/prompts/coach/unit-grammar-guide.md");

  expect(handler).toContain("function unitGuideKind");
  expect(handler).toContain("buildUnitGuideInput");
  expect(handler).toContain("coachRoute.unitGuide.user");
  expect(handler).toContain("coachRoute.unitGuide.system");
  expect(readFile("public/prompts/coach-route/unit-guide-user.md")).toContain("VERIFIED TEACHING CONTRACTS FOR ALL SEVEN CLASSES");
  expect(readFile("public/prompts/coach-route/unit-guide-system.md")).toContain("Do not ask the learner for the class index");
  expect(readFile("public/prompts/coach-route/unit-guide-system.md")).toContain("Do not mention Passages");
  expect(handler).toContain("renderUnitGuideReply");
  expect(source).toContain('dispatch({ type: "guide.chatGuideRequested", kind: "grammar" })');
  expect(learningActions).toContain("coach.unitGrammarGuide");
  expect(pageController).toContain("buildUnitGrammarGuideMessage");
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
    "Arranquemo con la clase por favor",
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
    "arranquemo con la clase por favor",
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
  const targetApplication = readFile("src/modules/coach-target/application.ts");
  const classBranchStart = handler.indexOf("if (isGiveClassQuestion(message))");
  const reviewBranchStart = handler.indexOf("if (isReviewQuestion(message))", classBranchStart);
  const classBranch = handler.slice(classBranchStart, reviewBranchStart);

  expect(targetResolver).toContain("function collectStrings");
  expect(targetResolver).toContain("resolveClassCoordinatesFromPayload");
  expect(handler).toContain("resolveCoachClassTarget");
  expect(targetApplication).toContain("resolveClassTargetFromMessage");
  expect(targetApplication).toContain("mergeClassTargetWithPayload(target, activeClassContent)");
  expect(targetApplication).toContain("readCurrentClassContent");
  expect(classBranch).toContain('callEnglishOSAction("getCurrentClassContent"');
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
  const rendererSource = readFile("src/modules/coach-delivery/replyRendering.ts");
  const rendererStart = rendererSource.indexOf("export function renderClassReply");
  const rendererEnd = rendererSource.indexOf("export function renderReviewReply");
  const renderer = rendererSource.slice(rendererStart, rendererEnd);

  expect(renderer).toContain("guidedOpeningFallback");
  expect(renderer).toContain("stripClassConfirmationDetours(stripPrematureClassClosure(stripModelOwnedIdentity(params.body)))");
  expect(renderer).toContain("learnerLocalClassPosition(params.position, params.unit, params.localClass, displayLesson)");
  expect(renderer).toContain('return readableMarkdownPunctuation(sanitizeLearnerFacingReply([position, "", ...header, "", teachingBody]');
  expect(renderer).toContain('`# ${ensureTerminalPeriod(`Unit ${params.unit}${title ? ` — ${title}` : ""}`)}`');
  expect(rendererSource).toContain("export function readableMarkdownPunctuation");
  expect(rendererSource).toContain("export function ensureTerminalPeriod");
  expect(rendererSource).toContain("Learning objective|Communication mission");
  expect(rendererSource).toContain("?::\\*\\*|\\*\\*:|:");
  expect(renderer).toContain('Hoy trabajaremos **${reference}**.');
  expect(renderer).toContain("learnerFriendlyLessonFlow(identity, params.localClass)");
  expect(rendererSource).toContain("function lessonRoadmap");
  expect(rendererSource).toContain("learnerFriendlyLessonFlow");
  expect(rendererSource).toContain("Primero verás la explicación, ejemplos y una práctica guiada");
  expect(readFile("knowledge/pedagogy/lesson-steps/default.json")).toContain("Before watching");
  expect(readFile("knowledge/pedagogy/lesson-steps/default.json")).toContain("While/After watching");
  expect(readFile("src/modules/coach-delivery/pedagogicalDeliveryPolicy.ts")).toContain("lessonBlockRoadmap");
  expect(renderer).toContain('Trabajaremos especialmente: **${formattedSkillFocus}**');
  expect(renderer).not.toContain("Empezamos con un bloque docente");
  expect(renderer).toContain("learnerFriendlyFocus");
  expect(rendererSource).toContain("it combines");
  expect(renderer).toContain("guidedOpeningFallback");
  expect(rendererSource).toContain("Video Class - Before watching");
  expect(renderer).not.toContain("const courseReference");
  expect(renderer).not.toContain("bookPages");
  expect(renderer).not.toContain("pdfPages");
  expect(renderer).not.toContain("Book ${");
  expect(renderer).not.toContain("PDF ${");
  expect(rendererSource).toContain("not grammar-centered");
  expect(rendererSource).toContain("Book pages:|PDF pages:");
  expect(readFile("public/prompts/coach-route/class-system.md")).toContain("The application renders learner position and lesson identity");
  expect(readFile("public/prompts/coach-route/class-system.md")).toContain("The application shows the finite class roadmap");
  expect(readFile("public/prompts/coach-route/class-system.md")).toContain("Do not invent unlimited extra sub-steps");
  expect(rendererSource).toContain("encontré tu clase activa en English OS");
  expect(rendererSource).toContain("Trabajaremos con **${target}**.");
  expect(handler).toContain("const explicitClassRule");
  expect(handler).toContain("Teach the requested unit and class even if the saved English OS position is different");
  expect(handler).toContain('do not offer \\"continue my current class\\" alternatives');
  expect(rendererSource).toContain("stripClassConfirmationDetours");
  expect(rendererSource).toContain("current english os position is different");
  expect(rendererSource).toContain("without your confirmation");
  expect(rendererSource).toContain("continue my current class");
  expect(rendererSource).toContain("found your (?:saved|current) (?:position|english os position)");
  expect(rendererSource).toContain("you asked for\\s+unit\\s+\\d+");
  expect(rendererSource).toContain(".replace(/\\bPassages\\s+Level\\s+\\d+\\s*[-—]\\s*/gi, \"\")");
  expect(handler).not.toContain("For this request, the active learning target is");
  expect(rendererSource).toContain("/\\bclass pack\\b/i");
});

test("video class roadmap starts with the learner action, not the wrapper section", async () => {
  const reply = renderClassReply({
    body: "Learning objective: predict ideas before watching.\n\nCommunication mission: use Unit language.\n\nYour turn: Write two predictions.",
    position: "Pedro, encontré tu clase activa en English OS: **Unit 4, Class 28**.",
    unit: 4,
    localClass: 7,
    displayClass: 28,
    identity: {
      lessonTitle: "Video Class",
      sections: "Video Class + Before watching + While watching + After watching + Speaking",
      skillFocus: "video, speaking",
    },
  });

  expect(reply).toContain("Primero verás la explicación, ejemplos y una práctica guiada");
  expect(reply).toContain("Before watching");
  expect(reply).toContain("Después continuaremos con una producción más completa");
  expect(reply).not.toContain("Evaluation gate");
  expect(reply).toContain("Unit 4, Class 7: Video Class");
  expect(reply).not.toContain("Unit 4, Class 28");
  expect(reply).not.toContain("Paso 1 de 6");
});

test("Grammar Plus fallback hides internal source-safety wording from learners", async () => {
  const reply = renderClassReply({
    body: "Short answer without enough teaching signals.",
    position: "Pedro, trabajaremos con **Unit 5, Class 34**.",
    unit: 5,
    localClass: 6,
    displayClass: 34,
    identity: {
      lessonTitle: "Grammar Plus",
      bookPages: "",
      pdfPages: "",
      sections: "Grammar Plus + Practice Lab",
      skillFocus: "grammar consolidation and controlled practice",
      grammarFocus: "Unit 5 Lesson B grammar consolidation from indexed Unit 5 context only",
      vocabularyFocus: "Recycle confirmed Unit 5 vocabulary only.",
      functions: "consolidate grammar accuracy; correct sentence structure; produce controlled and personalized examples",
      targetStructures: "Use only target structures confirmed in indexed Unit 5 class packs or learner-safe practice examples.",
      expectedProduction: "write two short controlled sentences",
    },
  });

  expect(reply).toContain("### Grammar focus");
  expect(reply).toContain("Controlled practice");
  expect(reply).toContain("Your turn");
  expect(reply).not.toContain("Recycle confirmed");
  expect(reply).not.toContain("confirmed Unit");
  expect(reply).not.toContain("Use only target structures confirmed");
  expect(reply).not.toContain("learner-safe");
  expect(reply).not.toContain("indexed Unit");
});

test("normal class opening teaches a full learning block before asking once", async () => {
  const reply = renderClassReply({
    body: [
      "## Starting point",
      "",
      "Imagine you're at a party.",
      "",
      "Two quick models:",
      "",
      "> He's very polite.",
      "> She's a bit unusual.",
      "",
      "Your turn: Which type of person do you meet most often?",
    ].join("\n"),
    position: "Pedro, trabajaremos con **Unit 5, Class 29**.",
    unit: 5,
    localClass: 29,
    displayClass: 29,
    identity: {
      lessonTitle: "Making conversation",
      bookPages: "",
      pdfPages: "",
      sections: "Starting point + Grammar + Vocabulary & Speaking",
      skillFocus: "reading, pair discussion, and vocabulary/speaking for making conversation",
      grammarFocus: "Infinitive and gerund phrases",
      vocabularyFocus: "appropriate; bad form; inappropriate; normal; offensive; polite; rude; strange; typical; unusual",
      functions: "comment on behavior; discuss what is appropriate; express opinions about social behavior",
      targetStructures: "It's + adjective/noun + infinitive phrase; gerund phrases; be considered + adjective",
      expectedProduction: "rewrite sentences using infinitive or gerund phrases, discuss situations using the vocabulary of appropriateness",
    },
  });

  expect(reply).not.toContain("Bloque 1 de 3 - Learn & practice");
  expect(reply).not.toContain("Empezamos con un bloque docente");
  expect(reply).toContain("### Learning objective");
  expect(reply).toContain("### Communication mission");
  expect(reply).toContain("### Grammar focus");
  expect(reply).toContain("### Vocabulary & useful expressions");
  expect(reply).toContain("Controlled practice");
  expect(reply).toContain("Model answers");
  expect(reply).toContain("infinitive and gerund phrases");
  expect(reply).toContain("It's + adjective/noun + infinitive phrase");
  expect(reply).toContain("gerund phrases");
  expect(reply).toContain("appropriate");
  expect(reply).toContain("rude");
  expect(reply).toContain("Rewrite with a gerund phrase");
  expect(reply).toContain("Your turn");
  expect(reply).not.toContain("Useful language:\n- It's + adjective/noun + infinitive phrase");
  expect(reply).not.toContain("types of people you might meet");
  expect(reply).not.toMatch(/Communication mission:.*Starting point/s);
  expectNoPoorTeachingTemplate(reply);
  expect(reply.match(/Your turn/gi)?.length).toBe(1);
});

test("teacher-led delivery is driven by Teaching Contract v2 instead of unit-specific patches", async () => {
  const contractV2 = readFile("src/modules/coach-delivery/teachingContractV2.ts");
  const policy = readFile("src/modules/coach-delivery/pedagogicalDeliveryPolicy.ts");

  expect(contractV2).toContain("export type TeachingContractV2");
  expect(contractV2).toContain("buildTeachingContractV2");
  expect(contractV2).toContain("coreConcept");
  expect(contractV2).toContain("spanishSupport");
  expect(contractV2).toContain("controlledPractice");
  expect(contractV2).toContain("guidedProduction");
  expect(contractV2).toContain("evaluationCriteria");
  expect(policy).toContain("buildTeachingContractV2(identity)");
  expect(policy).toContain("TeacherOpeningViewModel");
  expect(policy).toContain("SectionTeacherAdapter");
  expect(policy).toContain("renderTeacherOpening");
  expect(policy).toContain("controlledPractice");
  expect(policy).not.toMatch(/Unit\s+4\s+Class\s+27|unit\s*===\s*4|localClass\s*===\s*(?:22|23|24|25|26|27|28)/i);
});

test("Teaching Contract v2 uses a profile registry instead of pedagogical if-chains", async () => {
  const contractV2 = readFile("src/modules/coach-delivery/teachingContractV2.ts");
  const profiles = readFile("src/modules/coach-delivery/pedagogicalProfiles.ts");

  expect(contractV2).toContain("LANGUAGE_FAMILY_PROFILES");
  expect(contractV2).toContain("PEDAGOGICAL_ROLE_PROFILES");
  expect(profiles).toContain("LanguageFamilyProfile");
  expect(profiles).toContain("PedagogicalRoleProfile");

  expect(contractV2).not.toMatch(/family\s*===/);
  expect(contractV2).not.toMatch(/role\s*===/);
  expect(contractV2).not.toMatch(/localClass\s*===/);
  expect(contractV2).not.toMatch(/\/[^/\n]+\/[a-z]*\.test\(source\)/);
  expect(contractV2).not.toMatch(/if\s*\(\s*family\b/);
  expect(contractV2).not.toMatch(/if\s*\(\s*role\b/);
});

test("Teaching Contract v2 adds selective Spanish support and measurable production", async () => {
  const reply = renderClassReply({
    body: "Thin answer.",
    position: "Pedro, trabajaremos con **Unit 4, Class 25**.",
    unit: 4,
    localClass: 4,
    displayClass: 25,
    identity: {
      lessonTitle: "Tossing and turning",
      bookPages: "",
      pdfPages: "",
      sections: "Starting point + Vocabulary + Grammar",
      skillFocus: "speaking, vocabulary, grammar practice",
      grammarFocus: "clauses stating reasons and conditions: even if, considering that, as long as, unless, just in case, only if",
      vocabularyFocus: "be fast asleep; be wide awake; feel drowsy; nod off; take a power nap; be sound asleep",
      functions: "describe sleep habits; explain conditions and reasons",
      targetStructures: "even if I'm really tired; considering that most people need eight hours; as long as I take a nap during the day; Unless I get a good night's sleep",
      expectedProduction: "describe sleep habits using reason and condition clauses",
    },
  });

  expect(reply).toContain("Spanish support");
  expect(reply).toContain("unless =");
  expect(reply).toContain("as long as =");
  expect(reply).toContain("Controlled practice");
  expect(reply.toLowerCase()).toContain("write 4 sentences about your sleep or energy habits");
  expect(reply).not.toContain("To approve this class later");
  expect(reply).not.toContain("2 pts");
  expectNoPoorTeachingTemplate(reply);
});

test("Teaching Contract v2 prioritizes the primary grammar family over secondary advice signals", async () => {
  const identity = {
    lessonTitle: "It's about time!",
    bookPages: "",
    pdfPages: "",
    sections: "Starting point + Discussion + Grammar",
    skillFocus: "speaking, discussion, grammar practice",
    grammarFocus: "Reduced time clauses: before, after, while; other time clauses with ever since, as soon as, until, whenever, from the moment",
    vocabularyFocus: "morning person; late riser; night owl; burn out; calm down; doze off; perk up",
    functions: "define boldfaced words; give advice about routines",
    targetStructures: "After finishing my workout; While taking my lunch break; As soon as I get up; Until I've had my coffee",
    expectedProduction: "answer questions about routines and energy patterns using time clauses and unit vocabulary",
  };
  const contract = buildTeachingContractV2(identity);
  const reply = renderClassReply({
    body: "Thin answer.",
    position: "Pedro, trabajaremos con **Unit 4, Class 22**.",
    unit: 4,
    localClass: 1,
    displayClass: 22,
    identity,
  });

  expect(contract.guidedProduction).toContain("routine");
  expect(contract.guidedProduction).toContain("reduced time clauses");
  expect(contract.guidedProduction).not.toContain("advice dialogue");
  expect(reply.toLowerCase()).toContain("write 4-5 sentences about your routine");
  expect(reply).not.toContain("Write a 4-6 line advice dialogue");
  expectNoPoorTeachingTemplate(reply);
});

test("class reply displays the local unit class instead of the global class number", async () => {
  const reply = renderClassReply({
    body: "Thin answer.",
    position: "Pedro, trabajaremos con **Unit 4, Class 1**.",
    unit: 4,
    localClass: 1,
    displayClass: 22,
    identity: {
      lessonTitle: "It's about time!",
      bookPages: "",
      pdfPages: "",
      sections: "Starting point + Discussion + Grammar",
      skillFocus: "speaking, discussion, grammar practice",
      grammarFocus: "Reduced time clauses: before, after, while; other time clauses with ever since, as soon as, until, whenever, from the moment",
      vocabularyFocus: "morning person; late riser; night owl; burn out; calm down; doze off; perk up",
      functions: "define boldfaced words; talk about routines and energy",
      targetStructures: "After finishing my workout; While taking my lunch break; As soon as I get up; Until I've had my coffee",
      expectedProduction: "answer questions about routines and energy patterns using time clauses and unit vocabulary",
    },
  });

  expect(reply).toContain("Hoy trabajaremos **class 1");
  expect(reply).not.toContain("Hoy trabajaremos **class 22");
  expect(reply).toContain("Unit 4, Class 1: It's about time");
  expect(reply).not.toContain("Unit 4, Class 22");
  expect(reply).not.toContain("Evaluation gate");
  expect(reply).not.toContain("Use After finishing my workout, I head to the office");
  expect(reply).toContain("Use time clauses to describe when actions happen");
  expect(reply).toContain("### Grammar focus");
  expect(reply).toContain("Controlled practice");
  expect(reply.match(/Your turn/gi)?.length).toBe(1);
});

test("listening openings teach with teacher input before asking the learner", async () => {
  const reply = renderClassReply({
    body: "Too short.",
    position: "Pedro, trabajaremos con **Unit 4, Class 26**.",
    unit: 4,
    localClass: 5,
    displayClass: 26,
    identity: {
      lessonTitle: "I had the wildest dream.",
      bookPages: "",
      pdfPages: "",
      sections: "Listening & Speaking + Discussion + Reading",
      skillFocus: "listening, speaking, discussion, reading",
      grammarFocus: "listening for gist and details",
      vocabularyFocus: "recurring dreams; dream meanings; flying; falling; being chased; being embraced; losing teeth; winning; stands for",
      functions: "describe dreams; speculate about dream meanings",
      targetStructures: "I think that means...; It sounds like...; The balloon probably stands for...",
      expectedProduction: "predict and discuss dream meanings using dream vocabulary",
    },
  });

  expect(reply).toContain("Unit 4, Class 5: I had the wildest dream");
  expect(reply).not.toContain("Unit 4, Class 26");
  expect(reply).toContain("Teacher listening input");
  expect(reply).toContain("Gist question");
  expect(reply).toContain("Detail question");
  expect(reply).not.toContain("Evaluation gate");
  expect(reply).not.toContain("I had the wildest dream..");
  expect(reply.match(/Your turn/gi)?.length).toBe(1);
});

test("Grammar Plus openings emphasize accuracy decisions instead of repeating introductory production", async () => {
  const identity = {
    lessonTitle: "Grammar Plus",
    bookPages: "",
    pdfPages: "",
    sections: "Grammar Plus + Practice Lab",
    skillFocus: "grammar consolidation and practice lab",
    grammarFocus: "Unit lesson consolidation; time clauses with as soon as, after, before, until, when, whenever, and ever since",
    vocabularyFocus: "routines; energy; sleep; productivity; personal preference vocabulary",
    functions: "consolidate grammar accuracy",
    targetStructures: "As soon as I...; After I...; Before I...; Until I...; Whenever I...",
    expectedProduction: "produce corrected examples and explain which time clauses can be reduced",
  };
  const contract = buildTeachingContractV2(identity);
  const reply = renderClassReply({
    body: "Thin answer.",
    position: "Pedro, trabajaremos con **Unit 4, Class 24**.",
    unit: 4,
    localClass: 3,
    displayClass: 24,
    identity,
  });

  expect(contract.pedagogicalRole).toBe("grammar-plus");
  expect(contract.controlledPractice.join(" ")).toContain("Can this clause be reduced");
  expect(contract.guidedProduction).toContain("which clauses you can reduce");
  expect(reply).toContain("Can this clause be reduced");
  expect(reply).toContain("which clauses you can reduce");
  expectNoPoorTeachingTemplate(reply);
});

test("small talk class opening teaches openers, closers, and a dialogue before asking", async () => {
  const reply = renderClassReply({
    body: "Too short.",
    position: "Pedro, trabajaremos con **Unit 5, Class 30**.",
    unit: 5,
    localClass: 2,
    displayClass: 30,
    identity: {
      lessonTitle: "Making conversation",
      bookPages: "",
      pdfPages: "",
      sections: "Role Play + Listening + Writing",
      skillFocus: "role play, listening for conversation closings, and writing with an outline",
      grammarFocus: "The class is not grammar-centered and instead builds speaking, listening, and writing skills for making small talk and organizing ideas.",
      vocabularyFocus: "small talk; conversation openers; conversation closers; How's it going?; Can you believe this weather?; That's a great jacket.; Do you know many people here?; See you later.; Sorry, I've got to run.; Talk to you soon.; It was great to meet you.; I should get going.; I'll call you later.; outline; topic sentence; supporting sentences; concluding sentence",
      functions: "start small talk; keep a conversation going; close a conversation; organize ideas before writing",
      targetStructures: "small talk topics appropriate in your culture; conversation openers; conversation closers; outline notes; paragraph about a cultural rule",
      expectedProduction: "select appropriate small-talk topics in their culture,role-play starting a conversation, keeping it going for one minute, and closing it,complete an outline from a paragraph about a cultural rule,write a paragraph using their outline",
    },
  });

  expect(reply).toContain("## Role Play");
  expect(reply).toContain("Conversation openers");
  expect(reply).toContain("Conversation closers");
  expect(reply).toContain("How's it going?");
  expect(reply).toContain("It was great to meet you.");
  expect(reply).toContain("Model answers");
  expect(reply).toContain("Controlled practice");
  expect(reply).toContain("one polite closer");
  expectNoPoorTeachingTemplate(reply);
  expect(reply.match(/Your turn/gi)?.length).toBe(1);
});

test("Unit 4 openings use concrete pedagogy instead of mechanical fallback sentences", async () => {
  const samples = [
    {
      name: "stress advice listening and role play",
      identity: {
        lessonTitle: "Chilling out",
        bookPages: "",
        pdfPages: "",
        sections: "Listening & Speaking + Role Play + Writing",
        skillFocus: "listening, speaking, role play, writing",
        grammarFocus: "advice expressions and causes of stress",
        vocabularyFocus: "stress; fatigue; lack of energy; call a friend; get a massage; vent your feelings; do yoga; listen to music; exercise vigorously; take a hot bath",
        functions: "identify causes of stress; suggest practical solutions; give advice naturally",
        targetStructures: "too little time; too much traffic; too many responsibilities; Have you ever thought of (going) ...?; You might want to ...; It might not be a bad idea to ...",
        expectedProduction: "give advice about stress and energy problems in a short dialogue",
      },
      expected: ["I feel exhausted because I have too many responsibilities", "Have you ever thought of calling a friend", "take a hot bath"],
    },
    {
      name: "time clauses grammar",
      identity: {
        lessonTitle: "Grammar Plus",
        bookPages: "",
        pdfPages: "",
        sections: "Grammar Plus + Practice Lab",
        skillFocus: "grammar practice",
        grammarFocus: "time clauses with as soon as, after, before, until, when, whenever, and ever since",
        vocabularyFocus: "routines; energy; sleep; productivity; personal preference vocabulary",
        functions: "consolidate grammar accuracy; talk about routines and energy patterns",
        targetStructures: "As soon as I...; After I...; Before I...; Until I...; Whenever I...; Ever since I...",
        expectedProduction: "write sentences about routines using time clauses",
      },
      expected: ["As soon as I wake up", "Whenever I feel tired", "Controlled practice"],
    },
    {
      name: "sleep condition clauses",
      identity: {
        lessonTitle: "Tossing and turning",
        bookPages: "",
        pdfPages: "",
        sections: "Starting point + Vocabulary + Grammar",
        skillFocus: "speaking, vocabulary, grammar practice",
        grammarFocus: "clauses stating reasons and conditions: even if, considering that, as long as, unless, just in case, only if",
        vocabularyFocus: "be fast asleep; be wide awake; feel drowsy; nod off; take a power nap; be sound asleep",
        functions: "describe sleep habits; explain conditions and reasons",
        targetStructures: "even if I'm really tired; considering that most people need eight hours; as long as I take a nap during the day; Unless I get a good night's sleep",
        expectedProduction: "describe sleep habits using reason and condition clauses",
      },
      expected: ["Even if I am tired", "Unless I get enough sleep", "Controlled practice"],
    },
    {
      name: "dream listening",
      identity: {
        lessonTitle: "I had the wildest dream.",
        bookPages: "",
        pdfPages: "",
        sections: "Listening & Speaking + Discussion + Reading",
        skillFocus: "listening, speaking, discussion, reading",
        grammarFocus: "listening for gist and details",
        vocabularyFocus: "recurring dreams; dream meanings; flying; falling; being chased; being embraced; losing teeth; winning; stands for",
        functions: "describe dreams; speculate about dream meanings",
        targetStructures: "I think that means...; It sounds like...; The balloon probably stands for...",
        expectedProduction: "predict and discuss dream meanings using dream vocabulary",
      },
      expected: ["dream about falling", "Being chased", "The main idea is"],
    },
  ];

  for (const sample of samples) {
    const reply = renderClassReply({
      body: "Too short.",
      position: "Pedro, trabajaremos con **Unit 4**.",
      unit: 4,
      localClass: 1,
      displayClass: 22,
      identity: sample.identity,
    });

    for (const expected of sample.expected) expect(reply).toContain(expected);
    expect(reply).toContain("Your turn");
    expectNoPoorTeachingTemplate(reply);
    expect(reply.match(/Your turn/gi)?.length).toBe(1);
  }
});

test("generic pedagogical profiles produce rich openings without unit-specific hardcoding", async () => {
  const cases = [
    {
      name: "grammar",
      identity: {
        lessonTitle: "Grammar focus",
        bookPages: "",
        pdfPages: "",
        sections: "Starting point + Grammar + Discussion",
        skillFocus: "grammar practice and discussion",
        grammarFocus: "Modals of certainty and uncertainty",
        vocabularyFocus: "mystery; explanation; possibility; certainty",
        functions: "speculate about a situation; explain possible causes",
        targetStructures: "must have + past participle; might have + past participle; can't have + past participle",
        expectedProduction: "complete sentences using modals and discuss possible explanations",
      },
      expected: ["### Starting point", "Vocabulary & useful expressions", "must have + past participle", "Controlled practice"],
    },
    {
      name: "vocabulary-speaking",
      identity: {
        lessonTitle: "Vocabulary and Speaking",
        bookPages: "",
        pdfPages: "",
        sections: "Vocabulary & Speaking + Discussion",
        skillFocus: "vocabulary, speaking, and discussion",
        grammarFocus: "",
        vocabularyFocus: "deal with a problem; ignore a problem; solve a problem; aggravate a problem",
        functions: "describe problems; discuss solutions",
        targetStructures: "I usually... because...; One solution is...",
        expectedProduction: "use problem-solving vocabulary in a short spoken answer",
      },
      expected: ["### Vocabulary & Speaking", "Vocabulary & useful expressions", "deal with a problem", "Controlled practice"],
    },
    {
      name: "listening",
      identity: {
        lessonTitle: "Listening",
        bookPages: "",
        pdfPages: "",
        sections: "Listening + Discussion",
        skillFocus: "listening for gist and details",
        grammarFocus: "",
        vocabularyFocus: "main idea; detail; speaker; reason",
        functions: "understand the main idea; identify details",
        targetStructures: "The main idea is...; One detail is...",
        expectedProduction: "answer gist and detail questions after listening",
      },
      expected: ["Key language", "main idea", "details", "The main idea is"],
    },
    {
      name: "role-play",
      identity: {
        lessonTitle: "Role Play",
        bookPages: "",
        pdfPages: "",
        sections: "Role Play + Speaking",
        skillFocus: "role play and speaking fluency",
        grammarFocus: "",
        vocabularyFocus: "opening; follow-up question; polite response; close the conversation",
        functions: "start a conversation; respond naturally",
        targetStructures: "A: ... / B: ...; follow-up question + short answer",
        expectedProduction: "write and perform a short dialogue",
      },
      expected: ["### Role Play", "Model answers", "Controlled practice", "4-6 line dialogue"],
    },
    {
      name: "writing",
      identity: {
        lessonTitle: "Writing",
        bookPages: "",
        pdfPages: "",
        sections: "Writing",
        skillFocus: "writing with a clear paragraph",
        grammarFocus: "",
        vocabularyFocus: "topic sentence; supporting detail; concluding sentence; outline",
        functions: "organize ideas clearly in writing",
        targetStructures: "topic sentence; supporting sentences; concluding sentence",
        expectedProduction: "write a paragraph with a clear main idea",
      },
      expected: ["Key language", "Topic sentence", "Controlled practice", "Write one short paragraph"],
    },
    {
      name: "discussion",
      identity: {
        lessonTitle: "Discussion",
        bookPages: "",
        pdfPages: "",
        sections: "Discussion",
        skillFocus: "discussion and opinion sharing",
        grammarFocus: "",
        vocabularyFocus: "opinion; reason; example; agree; disagree",
        functions: "express an opinion clearly; give reasons",
        targetStructures: "I think... because...; In my opinion...; For example...",
        expectedProduction: "give an opinion with a reason and example",
      },
      expected: ["Key language", "I think", "For example", "Give your opinion"],
    },
  ];

  for (const sample of cases) {
    const reply = renderClassReply({
      body: "Thin model answer.",
      position: "Pedro, trabajaremos con **Unit 9, Class 1**.",
      unit: 9,
      localClass: 1,
      displayClass: 57,
      identity: sample.identity,
    });

    for (const expected of sample.expected) expect(reply).toContain(expected);
    expect(reply).toContain("Your turn");
    expectNoPoorTeachingTemplate(reply);
    expect(reply).not.toContain("Unit 5");
    expect(reply.match(/Your turn/gi)?.length).toBe(1);
  }
});

test("all classes display the canonical curriculum unit name", async () => {
  const titles = JSON.parse(readFile("knowledge/passages-unit-titles.json"));
  const teachingContracts = readFile("src/modules/coach-delivery/teachingContracts.ts");
  const replyRendering = readFile("src/modules/coach-delivery/replyRendering.ts");

  expect(Object.keys(titles.units)).toHaveLength(12);
  expect(titles.units[2]).toBe("Mistakes and mysteries");
  expect(titles.units[3]).toBe("Exploring new cities");
  expect(titles.units[4]).toBe("Early birds and night owls");
  expect(teachingContracts).toContain("passages-unit-titles.json");
  expect(replyRendering).toContain("const displayLesson = cleanDisplayLesson(identity.lessonTitle || identity.sections.split");
});

test("class opening cannot invent evaluation or logging results", async () => {
  const replyRendering = readFile("src/modules/coach-delivery/replyRendering.ts");
  const behavior = readFile("src/lib/englishOsCoachPrompt.ts");
  const classSystemPrompt = readFile("public/prompts/coach-route/class-system.md");

  expect(replyRendering).toContain("PREMATURE_CLASS_CLOSURE");
  expect(classSystemPrompt).toContain("Do not include the evaluation gate, recap, achievement, weakness");
  expect(behavior).toContain("SESSION CLOSING — ONLY AFTER LEARNER EVIDENCE");
  expect(behavior).toContain("Never claim that a session was logged unless");
  expect(behavior).toContain("only after confirmed success");
  expect(behavior).toContain("Teacher reaction");
  expect(behavior).toContain("Use 👍 when the answer is clearly correct or strong");
  expect(readFile("public/prompts/coach-route/general-system.md")).toContain("Cambridge-style correction");
});

test("strong learner answers advance the learning block instead of looping similar exercises", async () => {
  const behavior = readFile("src/lib/englishOsCoachPrompt.ts");
  const teacherStyle = readFile("src/lib/passagesTeacherStyle.ts");
  const routeHandler = readFile("src/lib/coachRouteHandler.ts");

  expect(behavior).toContain("ANTI-LOOP TEACHING RULES");
  expect(behavior).toContain("This learning block is approved");
  expect(behavior).toContain("Do not keep asking new exercises for the same micro-skill after a strong answer");
  expect(behavior).toContain("move to the next named class section or to the evaluation gate");
  expect(behavior).toContain('Use "Next block" instead of "Next exercise"');
  expect(behavior).toContain("Never end a teacher turn with vague instructions");
  expect(behavior).toContain("Never repeat the same prediction/preparation task after it was approved");
  expect(behavior).toContain("Treat each visible roadmap section as one substantial learning step");
  expect(behavior).toContain("Do not create hidden sub-steps inside the same roadmap section");
  expect(behavior).toContain("Never announce the same \"Next block: Paso X de Y");
  expect(behavior).toContain("It must not create another new task inside Paso X");
  expect(behavior).toContain("Before watching may ask for one compact prediction task only");
  expect(behavior).toContain("Do not ask a second simulated While watching dialogue");
  expect(behavior).toContain("UNIT CHECKPOINT RULES");
  expect(behavior).toContain("replace the normal class evaluation gate with a unit checkpoint");
  expect(behavior).toContain("Unit checkpoint approved");
  const classSystem = readFile("public/prompts/coach-route/class-system.md");
  expect(classSystem).toContain("Do not open the same numbered step again with a similar task");
  expect(classSystem).toContain("use at most one teacher-created While watching simulation");
  expect(routeHandler).toContain("incomingClassProgress");
  expect(routeHandler).toContain("buildClassContinuationInput");
  expect(routeHandler).toContain("class_continuation");
  expect(routeHandler).toContain("Local Class Pack + Class Progress State");
  expect(teacherStyle).toContain("current learning block is approved");
  expect(teacherStyle).toContain("name the exact roadmap step");
  expect(teacherStyle).toContain("Do not write vague closers");
  expect(teacherStyle).toContain("Give one targeted retry exercise only when the learner still needs work");
  expect(teacherStyle).toContain("Do not ask another similar practice question after a 9/10 or 10/10 answer");
  expect(teacherStyle).toContain("A visible roadmap section is one substantial learning step");
  expect(teacherStyle).toContain("Never ask a second prediction task with different wording");
  expect(teacherStyle).toContain("Do not generate another While watching dialogue");
  expect(teacherStyle).toContain("Repeating the same step is allowed only as \"Focused retry\"");
  expect(teacherStyle).toContain("Unit checkpoint rule");
  expect(teacherStyle).toContain("unit checkpoint instead of the normal class evaluation gate");
});

test("video class openings are enriched when the model returns a thin response", async () => {
  const replyRendering = readFile("src/modules/coach-delivery/replyRendering.ts");
  const helperStart = replyRendering.indexOf("export function ensureRichOpeningTask");
  const helperEnd = replyRendering.indexOf("export function renderClassReply", helperStart);
  const helper = replyRendering.slice(helperStart, helperEnd);

  expect(helper).toContain("hasExplicitOpeningTask");
  expect(helper).toContain("wordCount >= 45");
  expect(helper).toContain("Video Class - Before watching");
  expect(helper).toContain("We will not invent the video transcript");
  expect(helper).toContain("### Model answers.");
  expect(helper).toContain("### Your turn.");
  expect(helper).toContain("What do you think this video will show?");
  expect(helper).toContain("Write two short sentences");
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

test("approved class advancement is routed before stale class progress continuation", async () => {
  const source = readFile("src/lib/coachRouteHandler.ts");
  const advancementIndex = source.indexOf("if (isAdvancementIntent(message))");
  const continuationIndex = source.indexOf("if (incomingClassProgress && !isReviewQuestion(message) && !unitGuideKind(message))");

  expect(advancementIndex).toBeGreaterThan(0);
  expect(continuationIndex).toBeGreaterThan(0);
  expect(advancementIndex).toBeLessThan(continuationIndex);
  expect(source).toContain("resolveApprovedClassAdvancement");
  expect(source).toContain("Approved Class Advancement + Local Class Pack");
});
