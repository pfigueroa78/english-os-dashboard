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
  resolveClassProgressBeforeModel,
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
import { callCoachModel, callCompleteCoachModel, coachModelName, getOutputText, usage } from "@/modules/coach-route/modelClient";
import {
  globalClassFromLocalClass,
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

async function callEnglishOSActionOrThrow(action: string, params: Record<string, string>) {
  const data = await callEnglishOSAction(action, params);
  if (!data?.ok) {
    const error = data?.error ? String(data.error) : `English OS action failed: ${action}`;
    throw new Error(error);
  }
  return data;
}

function approvalWriteParams(input: {
  userEmail: string;
  learnerId: string;
  evaluation: NonNullable<ReturnType<typeof resolveClassProgressTurn>["approvalEvaluation"]>;
}) {
  return {
    userEmail: input.userEmail,
    learnerId: input.learnerId,
    classId: input.evaluation.classId,
    approvalEvidence: JSON.stringify(input.evaluation.approvalEvidence),
    rubric: JSON.stringify(input.evaluation.rubric),
    approvalScore: String(input.evaluation.score),
    evaluationGateCompleted: String(input.evaluation.evaluationGateCompleted),
    evaluatorVersion: input.evaluation.evaluatorVersion,
    policyId: input.evaluation.policyId,
    canApproveClass: String(input.evaluation.canApproveClass),
    blockingErrors: JSON.stringify(input.evaluation.blockingErrors),
    requestId: `${input.evaluation.classId}-${Date.now()}`,
  };
}

async function writeClassApprovalOrThrow(input: {
  userEmail: string;
  learnerId: string;
  evaluation: NonNullable<ReturnType<typeof resolveClassProgressTurn>["approvalEvaluation"]>;
}) {
  return callEnglishOSActionOrThrow(
    "approveCurrentClassExercises",
    approvalWriteParams(input),
  );
}

function buildApprovalWriteFailedReply(error: unknown) {
  const reason = error instanceof Error ? error.message : "approval persistence failed";
  return [
    "Evaluation passed, but approval could not be saved yet.",
    "",
    "Your class is not marked as approved yet.",
    "Please try again in a moment. If the problem continues, report the issue so we can review the English OS connection.",
    "",
    `Technical note: ${reason}`,
  ].join("\n");
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

function recentCoachText(conversationHistory: CoachMessage[]) {
  return conversationHistory
    .filter((message) => message.role === "coach")
    .slice(-2)
    .map((message) => message.content)
    .join("\n\n")
    .slice(-6000);
}

function learnerSafeMissingClassReply(unit: number, displayClass: number, active?: CoachClassProgressState | null) {
  return [
    `No pude abrir Unit ${unit}, Class ${displayClass} porque el material de esa clase no esta disponible localmente todavia.`,
    "",
    active
      ? `Sigues en Unit ${active.unit}, Class ${active.displayClass}, Paso ${active.currentStepIndex + 1} de ${active.steps.length}: ${active.steps[active.currentStepIndex]}.`
      : "Tu clase actual no cambia.",
    "",
    "Puedes continuar la clase actual o reportar el material faltante.",
  ].join("\n");
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
      usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
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
      console.error("[coach] missing local class pack", { filename, unit, localClass, displayClass });
      const session = sessionFor({ mode: "class", activeUnit: unit, activeClassNumber: displayClass, resourcesUnit: unit });
      return NextResponse.json({
        ok: true,
        agent: "coach",
        reply: learnerSafeMissingClassReply(unit, displayClass, incomingClassProgress),
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        classProgress: incomingClassProgress,
        source: "Learner-safe Missing Class Pack",
        sessionEvents: sessionEventsFor(session, "class_pack_missing", "Learner-safe Missing Class Pack"),
      });
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
    assertNoMetadataFallback(sanitizeLearnerFacingReply(modelBody));
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
      usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
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
      console.error("[coach] missing local class pack", { filename, unit, localClass, displayClass });
      const session = sessionFor({
        mode: "class",
        activeUnit: unit,
        activeClassNumber: displayClass,
        resourcesUnit: unit,
      });
      return NextResponse.json({
        ok: true,
        agent: "coach",
        reply: learnerSafeMissingClassReply(unit, displayClass, incomingClassProgress),
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        classProgress: incomingClassProgress,
        source: "Learner-safe Missing Class Pack",
        sessionEvents: sessionEventsFor(session, "class_pack_missing", "Learner-safe Missing Class Pack"),
      });
    }

    const { data: openaiData, reply: modelBody } = await callCompleteCoachModel(
      await buildClassInput({ message, learnerContext: context, classContent, classPack: content, filename, conversationHistory })
    );
    assertNoMetadataFallback(sanitizeLearnerFacingReply(modelBody));
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
      usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
    });
  }

  if (incomingClassProgress && !isReviewQuestion(message) && !unitGuideKind(message)) {
    const { unit, localClass, displayClass } = incomingClassProgress;
    const { filename, content } = loadClassPack(unit, localClass);
    if (!content) {
      console.error("[coach] missing local class pack", { filename, unit, localClass, displayClass });
      const session = sessionFor({ mode: "class", activeUnit: unit, activeClassNumber: displayClass, resourcesUnit: unit });
      return NextResponse.json({
        ok: true,
        agent: "coach",
        reply: learnerSafeMissingClassReply(unit, displayClass, incomingClassProgress),
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        classProgress: incomingClassProgress,
        source: "Learner-safe Missing Class Pack",
        sessionEvents: sessionEventsFor(session, "class_pack_missing", "Learner-safe Missing Class Pack"),
      });
    }
    const identity = classIdentity(content);
    const progress = enrichClassProgress(
      isSameClassProgress(incomingClassProgress, { unit, localClass, displayClass })
        ? incomingClassProgress
        : createClassProgress({ unit, localClass, displayClass, identity }),
      identity,
    );
    const globalClass = globalClassFromLocalClass(localClass, unit) || displayClass;
    const deterministicTurn = resolveClassProgressBeforeModel({
      progress,
      learnerMessage: message,
      recentCoachText: recentCoachText(conversationHistory),
    });
    if (deterministicTurn) {
      if (deterministicTurn.approvalEvaluation && deterministicTurn.progress.status === "approved") {
        try {
          await writeClassApprovalOrThrow({
            userEmail: email,
            learnerId,
            evaluation: deterministicTurn.approvalEvaluation,
          });
        } catch (error) {
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
            reply: buildApprovalWriteFailedReply(error),
            session,
            activeUnit: legacyActiveUnit(session),
            activeClass: legacyActiveClass(session),
            classProgress: {
              ...progress,
              status: "evaluation_ready",
              currentStepIndex: progress.steps.length - 1,
            },
            source: "Class Approval Persistence Failed",
            sessionEvents: sessionEventsFor(session, "class_approval_write_failed", "Class Approval Persistence Failed"),
            deterministicIdentity: true,
            usage: { model: "deterministic", inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0 },
          });
        }
      }
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
        reply: deterministicTurn.reply,
        session,
        activeUnit: legacyActiveUnit(session),
        activeClass: legacyActiveClass(session),
        classProgress: deterministicTurn.progress,
        source: `Deterministic Class Progress (${deterministicTurn.source})`,
        sessionEvents: sessionEventsFor(session, "class_progress_deterministic", `Deterministic Class Progress (${deterministicTurn.source})`),
        deterministicIdentity: true,
        usage: { model: "deterministic", inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0 },
      });
    }
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
    assertNoMetadataFallback(sanitizeLearnerFacingReply(modelBody));
    const resolvedProgressTurn = resolveClassProgressTurn({
      progress,
      learnerMessage: message,
      reply: readableClassContinuation(modelBody),
    });
    const reply = resolvedProgressTurn.reply;
    const nextProgress = resolvedProgressTurn.progress;
    if (resolvedProgressTurn.approvalEvaluation && nextProgress.status === "approved") {
      try {
        await writeClassApprovalOrThrow({
          userEmail: email,
          learnerId,
          evaluation: resolvedProgressTurn.approvalEvaluation,
        });
      } catch (error) {
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
          reply: buildApprovalWriteFailedReply(error),
          session,
          activeUnit: legacyActiveUnit(session),
          activeClass: legacyActiveClass(session),
          classProgress: {
            ...progress,
            status: "evaluation_ready",
            currentStepIndex: progress.steps.length - 1,
          },
          source: "Class Approval Persistence Failed",
          sessionEvents: sessionEventsFor(session, "class_approval_write_failed", "Class Approval Persistence Failed"),
          deterministicIdentity: true,
          usage: { model: coachModelName(), inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0 },
        });
      }
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
      usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
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
    assertNoMetadataFallback(sanitizeLearnerFacingReply(modelBody));
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
      usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
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
    assertNoMetadataFallback(sanitizeLearnerFacingReply(modelBody));
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
      usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
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
    usage: { model: coachModelName(), inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, estimatedCostUSD: 0 },
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
