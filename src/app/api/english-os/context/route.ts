import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { toCoachLearnerContextContract } from "@/modules/coach-integrations/contextContract";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;

function getMissionControl(data: any) {
  return (
    data?.missionControl?.missionControl ||
    data?.context?.missionControl?.missionControl ||
    data?.missionControl ||
    data?.context?.missionControl ||
    {}
  );
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await currentUser();
    const userEmail = user?.primaryEmailAddress?.emailAddress || "";

    if (!userEmail) {
      return NextResponse.json(
        { ok: false, error: "Missing userEmail from Clerk session." },
        { status: 400 }
      );
    }

    if (!ENGLISH_OS_BASE_URL || !ENGLISH_OS_TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Missing English OS environment variables." },
        { status: 500 }
      );
    }

    const url = new URL(ENGLISH_OS_BASE_URL);
    url.searchParams.set("token", ENGLISH_OS_TOKEN);
    url.searchParams.set("action", "getLearnerContext");
    url.searchParams.set("userEmail", userEmail);
    url.searchParams.set("learnerId", userEmail);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid Apps Script response: ${text.slice(0, 300)}`);
    }

    if (!response.ok || data?.ok === false) {
      throw new Error(data.error || "Failed to load English OS context.");
    }

    const missionControl = getMissionControl(data);
    const context = {
      ...data,
      missionControl,
    };
    const learnerContext = toCoachLearnerContextContract({ ...data, context, missionControl }, userEmail);

    return NextResponse.json({
      ok: true,
      userEmail,
      learnerId: learnerContext.learnerId,
      learnerContext,
      context,
      missionControl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
