import { NextResponse } from "next/server";
import { getApiLearnerIdentity } from "@/lib/apiLearnerIdentity";
import { ENGLISH_OS_COACH_BEHAVIOR_PROMPT } from "@/lib/englishOsCoachPrompt";
import { PASSAGES_TEACHER_STYLE_GUIDANCE } from "@/lib/passagesTeacherStyle";
import { renderServerPrompt } from "@/modules/coach-prompts/serverPromptRegistry";
import { getSavedPosition } from "@/modules/coach-context/coachContext";
import {
  buildClassProgressInstruction,
  createClassProgress,
  enrichClassProgress,
  isSameClassProgress,
  resolveClassProgressTurn,
  sanitizeClassProgress,
  type CoachClassProgressState,
} from "@/modules/coach-class-progress/application";
import { recordCoachSessionTelemetry } from "@/modules/coach-observability/sessionTelemetry";
import {
  hasExplicitClassCoordinates,
  classifyCoachIntent,
  isAdvancementIntent,
  isGiveClassQuestion,
  isReviewIntent,
  normalizeCoachMessage as normalize,
  unitGuideIntentKind,
} from "@/lib/coachIntent";
import { createCoachSessionContract, legacyActiveClass, legacyActiveUnit } from "@/modules/coach-session/contract";
import { transitionCoachSession } from "@/modules/coach-session/stateMachine";
import { resolveCoachClassTarget } from "@/modules/coach-target/application";
import { resolveApprovedClassAdvancement } from "@/modules/coach-advancement/application";
import {
  resolveUnitTarget,
} from "@/modules/coach-target/resolve";
import {
  classIdentity,
  loadClassPack,
  loadUnitTeachingContracts,
  openingSectionInstruction,
} from "@/modules/coach-delivery/teachingContracts";
import {
  assertNoMetadataFallback,
  learnerName,
  learnerPositionLine,
  renderClassReply,
  renderReviewReply,
  renderUnitGuideReply,
  sanitizeLearnerFacingReply,
} from "@/modules/coach-delivery/replyRendering";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_COACH_MODEL = process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_COACH_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_MAX_OUTPUT_TOKENS || 8000);
const OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS || 12000);

type CoachMessage = { role: "user" | "coach"; content: string };
type CoachImageAttachment = { dataUrl: string; mimeType?: string; name?: string };
type CoachRequest = {
  message: string;
  conversationHistory?: CoachMessage[];
  image?: CoachImageAttachment;
  session?: unknown;
  classProgress?: unknown;
};

function isReviewQuestion(message: string) {
  return isReviewIntent(message);
}
function unitGuideKind(message: string): "grammar" | "vocabulary" | null {
  return unitGuideIntentKind(message);
}

function getOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === "string") return openaiResponse.output_text.trim();
  const output = openaiResponse?.output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) => content?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function usage(openaiResponse: any) {
  const u = openaiResponse?.usage || {};
  return {
    inputTokens: Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0,
    outputTokens: Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0,
    totalTokens: Number(u.total_tokens ?? 0) || 0,
  };
}

function assertCompleteModelResponse(data: any, reply: string) {
  const reason = data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "";
  if (data?.status === "incomplete" || reason === "max_output_tokens") {
    throw new Error("The coach response reached its output limit before the class was complete. Please retry the class request.");
  }
  if (!reply.trim()) throw new Error("The coach returned an empty response.");
}

function modelResponseNeedsRetry(data: any, reply: string) {
  const reason = data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "";
  return data?.status === "incomplete" || reason === "max_output_tokens" || !reply.trim();
}

async function callEnglishOSAction(action: string, params: Record<string, string>) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) return null;
  const url = new URL(ENGLISH_OS_BASE_URL);
  url.searchParams.set("token", ENGLISH_OS_TOKEN);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const data = await response.json().catch(() => null);
  return response.ok ? data : null;
}

async function getLearnerContext(email: string) {
  if (process.env.NODE_ENV === "development" && (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN)) {
    console.warn("[coach] using development-only learner context; English OS read/write is unavailable");
    return {
      ok: true,
      learnerId: email,
      localValidationMode: true,
      user: { "Learner ID": email },
      missionControl: {},
    };
  }
  const data = await callEnglishOSAction("getLearnerContext", { userEmail: email, learnerId: email });
  if (!data?.ok) throw new Error(data?.error || "Unable to read learner context.");
  return data;
}

async function buildClassInput(params: {
  message: string;
  learnerContext: any;
  classContent: any;
  classPack: string;
  filename: string;
  conversationHistory: CoachMessage[];
}) {
  const identity = classIdentity(params.classPack);
  const explicitCoordinates = hasExplicitClassCoordinates(params.message);
  const explicitClassRule = explicitCoordinates
    ? [
        "Explicit class request wins:",
        "- The learner explicitly asked for a unit and class number. That request is authoritative for this turn.",
        "- Teach the requested unit and class even if the saved English OS position is different.",
        "- Use the saved position only as background context, not as a permission gate.",
        "- Do not ask for confirmation, do not offer \"continue my current class\" alternatives, and do not switch back to the saved/current class.",
      ].join("\n")
    : "";
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.class.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
        explicitClassRule,
        openingSectionInstruction: openingSectionInstruction(identity.sections),
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.class.user", {
        message: params.message,
        filename: params.filename,
        classPack: params.classPack.slice(0, 18000),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        classContent: JSON.stringify(params.classContent).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 2500),
      }),
    },
  ];
}

function readableClassContinuation(reply: string) {
  return sanitizeLearnerFacingReply(reply)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function buildClassContinuationInput(params: {
  message: string;
  learnerContext: any;
  classContent: any;
  classPack: string;
  filename: string;
  conversationHistory: CoachMessage[];
  classProgress: CoachClassProgressState;
}) {
  const identity = classIdentity(params.classPack);
  return [
    {
      role: "system",
      content: [
        ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        "",
        PASSAGES_TEACHER_STYLE_GUIDANCE,
        "",
        "CLASS CONTINUATION RULES:",
        "- This is not a new class opening. Continue the active class from the authoritative application progress state.",
        "- Do not restart the class and do not repeat already approved roadmap steps.",
        "- If the learner answer satisfies the current step, approve that step and advance to the next visible roadmap step.",
        "- If the learner answer has blocking errors, keep the same step and give exactly one Focused retry.",
        "- Do not expose raw class pack, source, retrieval, or application-state metadata.",
        "",
        buildClassProgressInstruction(params.classProgress),
        "",
        openingSectionInstruction(identity.sections),
      ].join("\n"),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.class.user", {
        message: params.message,
        filename: params.filename,
        classPack: params.classPack.slice(0, 18000),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        classContent: JSON.stringify(params.classContent).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 4000),
      }),
    },
  ];
}

async function buildGeneralInput(context: any, message: string, conversationHistory: CoachMessage[]) {
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.general.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.general.user", {
        learnerContext: JSON.stringify(context).slice(0, 7000),
        conversationHistory: JSON.stringify(conversationHistory).slice(0, 2500),
        message,
      }),
    },
  ];
}

async function buildReviewInput(params: {
  message: string;
  learnerContext: any;
  unit: number;
  contracts: ReturnType<typeof loadUnitTeachingContracts>;
  conversationHistory: CoachMessage[];
}) {
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.review.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.review.user", {
        message: params.message,
        unit: params.unit,
        contracts: params.contracts.map((item) => `CLASS ${item.localClass}\n${item.contract}`).join("\n\n"),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 2500),
      }),
    },
  ];
}

async function buildVisualVocabularyInput(context: any, message: string, image: CoachImageAttachment, conversationHistory: CoachMessage[]) {
  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.visualVocabulary.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
      }),
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: await renderServerPrompt("coachRoute.visualVocabulary.user", {
            message: message || "Analyze this image and help me learn vocabulary from it.",
            learnerContext: JSON.stringify(context).slice(0, 3500),
            conversationHistory: JSON.stringify(conversationHistory).slice(0, 1600),
            imageName: image.name || "learner-photo",
            imageMimeType: image.mimeType || "image/jpeg",
          }),
        },
        {
          type: "input_image",
          image_url: image.dataUrl,
        },
      ],
    },
  ];
}
async function buildUnitGuideInput(params: {
  message: string;
  learnerContext: any;
  unit: number;
  kind: "grammar" | "vocabulary";
  contracts: ReturnType<typeof loadUnitTeachingContracts>;
  conversationHistory: CoachMessage[];
}) {
  const guideFocus =
    params.kind === "grammar"
      ? "grammar structures, usage rules, Spanish explanations for difficult transfer points, common mistakes, and a short practice check"
      : "high-value chunks, collocations, Spanish meanings, English examples, pronunciation tips, and a short practice check";

  return [
    {
      role: "system",
      content: await renderServerPrompt("coachRoute.unitGuide.system", {
        baseBehaviorPrompt: ENGLISH_OS_COACH_BEHAVIOR_PROMPT,
        teacherStylePrompt: PASSAGES_TEACHER_STYLE_GUIDANCE,
        guideKind: params.kind,
        guideFocus,
      }),
    },
    {
      role: "user",
      content: await renderServerPrompt("coachRoute.unitGuide.user", {
        message: params.message,
        unit: params.unit,
        guideKind: params.kind,
        contracts: params.contracts.map((item) => `CLASS ${item.localClass}\n${item.contract}`).join("\n\n"),
        learnerContext: JSON.stringify(params.learnerContext).slice(0, 5000),
        conversationHistory: JSON.stringify(params.conversationHistory).slice(0, 2500),
      }),
    },
  ];
}

async function callCoachModel(input: any[], maxOutputTokens = OPENAI_COACH_MAX_OUTPUT_TOKENS) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_COACH_MODEL, input, max_output_tokens: maxOutputTokens }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
  return data;
}

async function callCompleteCoachModel(input: any[]) {
  let data = await callCoachModel(input);
  let reply = getOutputText(data);

  if (modelResponseNeedsRetry(data, reply)) {
    console.warn("[coach] incomplete model response; retrying", {
      status: data?.status || "unknown",
      reason: data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "empty_output",
      outputTokens: usage(data).outputTokens,
      retryMaxOutputTokens: OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS,
    });
    data = await callCoachModel(input, OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS);
    reply = getOutputText(data);
  }

  assertCompleteModelResponse(data, reply);
  return { data, reply };
}

export async function coachPost(request: Request) {
  const identity = await getApiLearnerIdentity(request);
  if (!identity.authenticated) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const email = identity.email;
  if (!email) return NextResponse.json({ ok: false, error: "No email found for current user." }, { status: 400 });

  const body = (await request.json()) as CoachRequest;
  const message = String(body.message || "").trim();
  const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-12) : [];
  const image = body.image?.dataUrl ? body.image : null;
  const incomingClassProgress = sanitizeClassProgress(body.classProgress);
  if (!message && !image) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });

  const context = await getLearnerContext(email);
  const user = context?.user || {};
  const learnerId = user["Learner ID"] || context?.learnerId || email;
  const savedPosition = getSavedPosition(context);
  const currentUnit = savedPosition.unit || user["Current Unit"] || context?.currentUnit || "";
  const currentLesson = savedPosition.lesson || user["Current Lesson"] || context?.currentLesson || "";
  const sessionFor = (input: Parameters<typeof createCoachSessionContract>[0]) =>
    createCoachSessionContract({
      savedUnit: currentUnit,
      savedLesson: currentLesson,
      source: "english_os",
      ...input,
    });
  const baseSession = sessionFor({ mode: currentUnit ? "current" : "fallback", activeUnit: currentUnit, resourcesUnit: currentUnit });
  const sessionEventsFor = (
    session: ReturnType<typeof createCoachSessionContract>,
    requestKind: string,
    source: string,
  ) => {
    const transition = transitionCoachSession({
      current: baseSession,
      event: { type: "API_RETURNED_SESSION", session },
    });
    recordCoachSessionTelemetry({
      learnerEmail: email,
      requestKind,
      source,
      session: transition.state,
      events: transition.events,
    });
    return transition.events;
  };

  if (image) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(image.dataUrl)) {
      return NextResponse.json({ ok: false, error: "Unsupported image format." }, { status: 400 });
    }

    const openaiData = await callCoachModel(
      await buildVisualVocabularyInput(context, message || "Analyze this image for English vocabulary.", image, conversationHistory),
      2200
    );
    const reply = sanitizeLearnerFacingReply(getOutputText(openaiData));
    const u = usage(openaiData);
    const session = sessionFor({ mode: "conversation", activeUnit: currentUnit, resourcesUnit: currentUnit });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      source: "Ephemeral Visual Vocabulary Analysis",
      sessionEvents: sessionEventsFor(session, "visual_vocabulary", "Ephemeral Visual Vocabulary Analysis"),
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isAdvancementIntent(message)) {
    const intent = classifyCoachIntent(message).kind;
    const advancement = resolveApprovedClassAdvancement({
      intent: intent === "next_unit" ? "next_unit" : "next_class",
      classProgress: incomingClassProgress,
    });

    if (advancement.kind === "blocked") {
      const session = incomingClassProgress
        ? sessionFor({
            mode: "class",
            activeUnit: incomingClassProgress.unit,
            activeClassNumber: incomingClassProgress.displayClass,
            lessonTitle: incomingClassProgress.lessonTitle,
            resourcesUnit: incomingClassProgress.unit,
          })
        : baseSession;
      return NextResponse.json({
        ok: true,
        agent: "coach",
        reply: advancement.reply,
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        classProgress: incomingClassProgress,
        source: "Class Advancement Guard",
        sessionEvents: sessionEventsFor(session, "class_advancement_blocked", "Class Advancement Guard"),
      });
    }

    await callEnglishOSAction("advanceToNextClass", {
      userEmail: email,
      learnerId,
    }).catch(() => null);

    const { unit, localClass, globalClass, displayClass } = advancement.target;
    const { filename, content } = loadClassPack(unit, localClass);
    if (!content) {
      return NextResponse.json({ ok: false, error: `Missing local class pack: ${filename}` }, { status: 500 });
    }

    const classContent = await callEnglishOSAction("getClassContent", {
      unit: String(unit),
      classNumber: String(globalClass),
      userEmail: email,
      learnerId,
    }).catch(() => null);
    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildClassInput({ message, learnerContext: context, classContent, classPack: content, filename, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const identity = classIdentity(content);
    const classProgress = createClassProgress({ unit, localClass, displayClass, identity });
    const position = [
      advancement.replyPrefix,
      "",
      learnerPositionLine({
        context,
        name: learnerName(context, ""),
        requestedUnit: unit,
        requestedClass: displayClass,
        explicitClassRequest: false,
      }),
    ].filter(Boolean).join("\n");
    const reply = renderClassReply({ body: modelBody, position, identity, unit, localClass, displayClass });
    const u = usage(openaiData);
    const session = sessionFor({
      mode: "class",
      activeUnit: unit,
      activeClassNumber: displayClass,
      lessonTitle: identity.lessonTitle,
      resourcesUnit: unit,
    });

    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      activeClass: legacyActiveClass(session),
      source: "Approved Class Advancement + Local Class Pack",
      sessionEvents: sessionEventsFor(session, "class_advancement", "Approved Class Advancement + Local Class Pack"),
      deterministicIdentity: true,
      classProgress,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isGiveClassQuestion(message)) {
    const targetResult = await resolveCoachClassTarget({
      message,
      currentUnit,
      context,
      readCurrentClassContent: () => callEnglishOSAction("getCurrentClassContent", { userEmail: email, learnerId }),
    });
    if (targetResult.kind === "needs_clarification") {
      const unit = targetResult.target.unit;
      const session = sessionFor({ mode: "class", activeUnit: unit, activeClassNumber: null, resourcesUnit: unit });
      return NextResponse.json({
        ok: true,
        agent: "coach",
        reply: targetResult.reply,
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        source: "Current Class Clarification",
        sessionEvents: sessionEventsFor(session, "class_clarification", "Current Class Clarification"),
      });
    }

    const { target, activeClassContent } = targetResult;
    const { unit, localClass, globalClass, displayClass } = target;
    const classContent = await callEnglishOSAction("getClassContent", {
      unit: String(unit),
      classNumber: String(globalClass),
      userEmail: email,
      learnerId,
    }).catch(() => activeClassContent);

    const { filename, content } = loadClassPack(unit, localClass);
    if (!content) {
      return NextResponse.json({ ok: false, error: `Missing local class pack: ${filename}` }, { status: 500 });
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildClassInput({ message, learnerContext: context, classContent, classPack: content, filename, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const identity = classIdentity(content);
    const classProgress = createClassProgress({ unit, localClass, displayClass, identity });
    const position = learnerPositionLine({
      context,
      name: learnerName(context, ""),
      requestedUnit: unit,
      requestedClass: displayClass,
      explicitClassRequest: target.explicitClassRequest,
    });
    const reply = renderClassReply({ body: modelBody, position, identity, unit, localClass, displayClass });
    const u = usage(openaiData);
    const session = sessionFor({
      mode: "class",
      activeUnit: unit,
      activeClassNumber: displayClass,
      lessonTitle: identity.lessonTitle,
      resourcesUnit: unit,
    });

    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      activeClass: legacyActiveClass(session),
      source: "Local Class Pack + Pedagogy Prompt",
      sessionEvents: sessionEventsFor(session, "class", "Local Class Pack + Pedagogy Prompt"),
      deterministicIdentity: true,
      classProgress,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (incomingClassProgress && !isReviewQuestion(message) && !unitGuideKind(message)) {
    const { unit, localClass, displayClass } = incomingClassProgress;
    const { filename, content } = loadClassPack(unit, localClass);
    if (!content) {
      return NextResponse.json({ ok: false, error: `Missing local class pack: ${filename}` }, { status: 500 });
    }
    const identity = classIdentity(content);
    const progress = enrichClassProgress(
      isSameClassProgress(incomingClassProgress, { unit, localClass, displayClass })
        ? incomingClassProgress
        : createClassProgress({ unit, localClass, displayClass, identity }),
      identity,
    );
    const globalClass = (unit - 1) * 7 + localClass;
    const classContent = await callEnglishOSAction("getClassContent", {
      unit: String(unit),
      classNumber: String(globalClass),
      userEmail: email,
      learnerId,
    }).catch(() => null);
    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildClassContinuationInput({
        message,
        learnerContext: context,
        classContent,
        classPack: content,
        filename,
        conversationHistory,
        classProgress: progress,
      }),
    );
    assertNoMetadataFallback(modelBody);
    const resolvedProgressTurn = resolveClassProgressTurn({
      progress,
      learnerMessage: message,
      reply: readableClassContinuation(modelBody),
    });
    const reply = resolvedProgressTurn.reply;
    const nextProgress = resolvedProgressTurn.progress;
    if (resolvedProgressTurn.approvalEvaluation && nextProgress.status === "approved") {
      await callEnglishOSAction("approveCurrentClassExercises", {
        userEmail: email,
        learnerId,
        classId: resolvedProgressTurn.approvalEvaluation.classId,
        approvalEvidence: JSON.stringify(resolvedProgressTurn.approvalEvaluation.approvalEvidence),
        rubric: JSON.stringify(resolvedProgressTurn.approvalEvaluation.rubric),
      }).catch(() => null);
    }
    const u = usage(openaiData);
    const session = sessionFor({
      mode: "class",
      activeUnit: unit,
      activeClassNumber: displayClass,
      lessonTitle: identity.lessonTitle,
      resourcesUnit: unit,
    });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      activeClass: legacyActiveClass(session),
      classProgress: nextProgress,
      source: "Local Class Pack + Class Progress State",
      sessionEvents: sessionEventsFor(session, "class_continuation", "Local Class Pack + Class Progress State"),
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (isReviewQuestion(message)) {
    const unit = resolveUnitTarget(message, currentUnit);
    if (!unit) return NextResponse.json({ ok: false, error: "I need a unit number for the review." }, { status: 400 });

    const contracts = loadUnitTeachingContracts(unit);
    const missing = contracts.filter((item) => !item.contract);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing teaching contracts for unit ${unit}: ${missing.map((item) => item.localClass).join(", ")}` },
        { status: 500 }
      );
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildReviewInput({ message, learnerContext: context, unit, contracts, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, ""),
      requestedUnit: unit,
      review: true,
    });
    const reply = renderReviewReply({ body: modelBody, position, unit });
    const u = usage(openaiData);
    const session = sessionFor({ mode: "review", activeUnit: unit, resourcesUnit: unit });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      source: "Seven Local Teaching Contracts + Review Pedagogy Prompt",
      sessionEvents: sessionEventsFor(session, "review", "Seven Local Teaching Contracts + Review Pedagogy Prompt"),
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  const guideKind = unitGuideKind(message);
  if (guideKind) {
    const unit = resolveUnitTarget(message, currentUnit);
    if (!unit) return NextResponse.json({ ok: false, error: "I need a unit number for the guide." }, { status: 400 });

    const contracts = loadUnitTeachingContracts(unit);
    const missing = contracts.filter((item) => !item.contract);
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: `Missing teaching contracts for unit ${unit}: ${missing.map((item) => item.localClass).join(", ")}` },
        { status: 500 }
      );
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildUnitGuideInput({ message, learnerContext: context, unit, kind: guideKind, contracts, conversationHistory })
    );
    assertNoMetadataFallback(modelBody);
    const position = learnerPositionLine({
      context,
      name: learnerName(context, ""),
      requestedUnit: unit,
      guideKind,
    });
    const reply = renderUnitGuideReply({ body: modelBody, position, unit, kind: guideKind });
    const u = usage(openaiData);
    const session = sessionFor({ mode: "guide", activeUnit: unit, resourcesUnit: unit });
    return NextResponse.json({
      ok: true,
      agent: "coach",
      reply,
      session,
      activeUnit: legacyActiveUnit(session),
      source: `Seven Local Teaching Contracts + ${guideKind} Guide Prompt`,
      sessionEvents: sessionEventsFor(session, "guide", `Seven Local Teaching Contracts + ${guideKind} Guide Prompt`),
      deterministicIdentity: true,
      usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  const openaiData = await callCoachModel(await buildGeneralInput(context, message, conversationHistory));
  const reply = sanitizeLearnerFacingReply(getOutputText(openaiData));
  const u = usage(openaiData);
  const session = sessionFor({ mode: "conversation", activeUnit: currentUnit, resourcesUnit: currentUnit });
  return NextResponse.json({
    ok: true,
    agent: "coach",
    reply,
    session,
    sessionEvents: sessionEventsFor(session, "conversation", "General Coach Prompt"),
    usage: { model: OPENAI_COACH_MODEL, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
  });
}

export async function coachPostSafe(request: Request) {
  try {
    return await coachPost(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown coach error";
    console.error("[coach] request failed", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
