import { NextResponse } from "next/server";
import { getApiLearnerIdentity } from "@/lib/apiLearnerIdentity";

export const runtime = "nodejs";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;

type DiagnosticCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function currentUnitFrom(data: any) {
  return (
    data?.context?.recommendedCurrentPosition?.unit ||
    data?.context?.currentPosition?.unit ||
    data?.context?.learningState?.currentUnit ||
    data?.learningState?.currentUnit ||
    data?.context?.user?.["Current Unit"] ||
    data?.user?.["Current Unit"] ||
    ""
  );
}

function currentLessonFrom(data: any) {
  return (
    data?.context?.recommendedCurrentPosition?.lesson ||
    data?.context?.currentPosition?.lesson ||
    data?.context?.learningState?.currentLesson ||
    (data?.context?.learningState?.currentClass ? `Class ${data.context.learningState.currentClass}` : "") ||
    data?.learningState?.currentLesson ||
    (data?.learningState?.currentClass ? `Class ${data.learningState.currentClass}` : "") ||
    data?.context?.user?.["Current Lesson"] ||
    data?.user?.["Current Lesson"] ||
    ""
  );
}

async function fetchEnglishOSContext(email: string) {
  if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) {
    return {
      ok: false,
      detail: "Missing ENGLISH_OS_BASE_URL or ENGLISH_OS_TOKEN.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const url = new URL(ENGLISH_OS_BASE_URL);
    url.searchParams.set("token", ENGLISH_OS_TOKEN);
    url.searchParams.set("action", "getLearnerContext");
    url.searchParams.set("userEmail", email);
    url.searchParams.set("learnerId", email);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const data = JSON.parse(text);
    const hasUser = Boolean(data?.context?.user || data?.user);
    const unit = currentUnitFrom(data);
    const lesson = currentLessonFrom(data);

    return {
      ok: response.ok && data?.ok !== false,
      detail: hasUser
        ? `English OS respondió. Usuario encontrado${unit ? ` · ${unit}` : ""}${lesson ? ` · ${lesson}` : ""}.`
        : "English OS respondió, pero no encontré perfil de usuario.",
      data: {
        hasUser,
        unit,
        lesson,
      },
    };
  } catch (error) {
    return {
      ok: false,
      detail: `English OS request failed: ${safeError(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const checks: DiagnosticCheck[] = [];

  checks.push({
    name: "Clerk publishable key",
    ok: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    detail: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "Configured." : "Missing.",
  });
  checks.push({
    name: "Clerk secret key",
    ok: Boolean(process.env.CLERK_SECRET_KEY),
    detail: process.env.CLERK_SECRET_KEY ? "Configured." : "Missing.",
  });
  checks.push({
    name: "English OS env",
    ok: Boolean(ENGLISH_OS_BASE_URL && ENGLISH_OS_TOKEN),
    detail: ENGLISH_OS_BASE_URL && ENGLISH_OS_TOKEN ? "Configured." : "Missing ENGLISH_OS_BASE_URL or ENGLISH_OS_TOKEN.",
  });

  try {
    const identity = await getApiLearnerIdentity(request);
    checks.push({
      name: "Clerk session",
      ok: identity.authenticated,
      detail: identity.authenticated
        ? `Authenticated session detected (${identity.source}).`
        : "No authenticated session detected.",
    });

    if (!identity.authenticated) {
      return NextResponse.json({ ok: false, checks });
    }

    const email = identity.email;
    checks.push({
      name: "Learner email",
      ok: Boolean(email),
      detail: email ? `Email detected: ${email}` : "No primary email in Clerk user.",
    });

    if (!email) {
      return NextResponse.json({ ok: false, checks });
    }

    const englishOS = await fetchEnglishOSContext(email);
    checks.push({
      name: "English OS context",
      ok: englishOS.ok,
      detail: englishOS.detail,
    });

    return NextResponse.json({
      ok: checks.every((check) => check.ok),
      checks,
      context: englishOS.data || null,
    });
  } catch (error) {
    checks.push({
      name: "Diagnostics route",
      ok: false,
      detail: safeError(error),
    });
    return NextResponse.json({ ok: false, checks }, { status: 500 });
  }
}
