import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const TOKEN = process.env.ENGLISH_OS_TOKEN;

export async function POST() {
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

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "No email found." },
        { status: 400 }
      );
    }

    if (!BASE_URL || !TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Missing English OS environment variables." },
        { status: 500 }
      );
    }

    const contextUrl = new URL(BASE_URL);
    contextUrl.searchParams.set("token", TOKEN);
    contextUrl.searchParams.set("action", "getLearnerContext");
    contextUrl.searchParams.set("userEmail", email);
    contextUrl.searchParams.set("learnerId", email);

    const contextResponse = await fetch(contextUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const contextData = await contextResponse.json();
    const role = contextData?.user?.["Role"] || "learner";
    const active = String(contextData?.user?.["Active"] || "").toLowerCase();

    if (!contextData?.user || active === "false" || role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          authenticated: true,
          authorized: false,
          error: "Admin access required to send reports.",
        },
        { status: 403 }
      );
    }

    const reportUrl = new URL(BASE_URL);
    reportUrl.searchParams.set("token", TOKEN);
    reportUrl.searchParams.set("action", "sendDailyReportsAllUsers");

    const reportResponse = await fetch(reportUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const reportData = await reportResponse.json();

    return NextResponse.json({
      ok: true,
      authenticated: true,
      authorized: true,
      report: reportData,
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
