import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { toCoachWorkbookContract } from "@/modules/coach-integrations/workbookContract";

const ENGLISH_OS_BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const ENGLISH_OS_TOKEN = process.env.ENGLISH_OS_TOKEN;

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const unit = searchParams.get("unit") || "";
    const lesson = searchParams.get("lesson") || "";

    const url = new URL(ENGLISH_OS_BASE_URL);
    url.searchParams.set("token", ENGLISH_OS_TOKEN);
    url.searchParams.set("action", "createVocabularyWorkbook");
    url.searchParams.set("userEmail", userEmail);
    url.searchParams.set("learnerId", userEmail);

    if (unit) {
      url.searchParams.set("unit", unit);
    }

    if (lesson) {
      url.searchParams.set("lesson", lesson);
    }

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

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Failed to create vocabulary workbook.");
    }

    const workbook = toCoachWorkbookContract("vocabulary", data);

    return NextResponse.json({
      ok: true,
      workbook,
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
