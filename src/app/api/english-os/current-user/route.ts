import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const TOKEN = process.env.ENGLISH_OS_TOKEN;
const ALLOW_SELF_REGISTRATION =
  process.env.ENGLISH_OS_ALLOW_SELF_REGISTRATION === "true";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { ok: false, authenticated: false, authorized: false },
        { status: 401 }
      );
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
    const name =
      clerkUser?.fullName ||
      clerkUser?.firstName ||
      email ||
      "New English OS Learner";

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: true,
          authorized: false,
          error: "No email found in Clerk user.",
        },
        { status: 400 }
      );
    }

    if (!BASE_URL || !TOKEN) {
      return NextResponse.json(
        {
          ok: false,
          authenticated: true,
          authorized: false,
          error: "Missing English OS environment variables.",
        },
        { status: 500 }
      );
    }

    const existingUser = await getLearnerContext(email);

    const active = String(existingUser?.user?.["Active"] || "").toLowerCase();
    const authorized = Boolean(existingUser?.user) && active !== "false";

    if (authorized) {
      return NextResponse.json({
        ok: true,
        authenticated: true,
        authorized: true,
        email,
        englishOS: existingUser,
        role: existingUser?.user?.["Role"] || "learner",
      });
    }

    if (!existingUser?.user && ALLOW_SELF_REGISTRATION) {
      await registerUserFromClerk(email, name);

      const newUser = await getLearnerContext(email);

      return NextResponse.json({
        ok: true,
        authenticated: true,
        authorized: true,
        selfRegistered: true,
        email,
        englishOS: newUser,
        role: "learner",
      });
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      authorized: false,
      email,
      selfRegistrationEnabled: ALLOW_SELF_REGISTRATION,
      error: ALLOW_SELF_REGISTRATION
        ? "User could not be registered automatically."
        : "User is not registered in English OS and self-registration is disabled.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        authorized: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function getLearnerContext(email: string) {
  const url = new URL(BASE_URL as string);
  url.searchParams.set("token", TOKEN as string);
  url.searchParams.set("action", "getLearnerContext");
  url.searchParams.set("userEmail", email);
  url.searchParams.set("learnerId", email);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  return response.json();
}

async function registerUserFromClerk(email: string, name: string) {
  const response = await fetch(BASE_URL as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      token: TOKEN,
      sourceAgent: "English OS Dashboard",
      userEmail: email,
      learnerId: email,
      userProfile: {
        name,
        userEmail: email,
        learnerId: email,
        preferredChannel: "Dashboard",
        currentUnit: "",
        currentLesson: "",
        currentCEFR: "",
        active: true,
        notes: "Self-registered from Clerk Google SSO.",
      },
      dailyLog: {
        skill: "System",
        activity: "Self registration",
        mainTopic: "English OS Dashboard access",
        time: "automatic",
        summary: "Learner self-registered through Clerk Google SSO.",
        weakness: "",
        newVocabulary: "",
        nextAction: "Start learner onboarding.",
      },
    }),
  });

  return response.json();
}