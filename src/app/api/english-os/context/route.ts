import { NextResponse } from "next/server";
import { getApiLearnerIdentity } from "@/lib/apiLearnerIdentity";

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

export async function GET(request: Request) {
  try {
    const identity = await getApiLearnerIdentity(request);

    if (!identity.authenticated) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userEmail = identity.email;

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

    return NextResponse.json({
      ok: true,
      userEmail,
      learnerId: data.learnerId || userEmail,
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
