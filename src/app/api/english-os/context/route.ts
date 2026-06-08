import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const TOKEN = process.env.ENGLISH_OS_TOKEN;

export async function GET(request: NextRequest) {
  try {
    if (!BASE_URL || !TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Missing English OS environment variables." },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    const userEmail = searchParams.get("userEmail");
    const learnerId = searchParams.get("learnerId") || userEmail;
    const action = searchParams.get("action") || "getLearnerContext";

    if (!userEmail) {
      return NextResponse.json(
        { ok: false, error: "Missing userEmail." },
        { status: 400 }
      );
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("token", TOKEN);
    url.searchParams.set("action", action);
    url.searchParams.set("userEmail", userEmail);
    url.searchParams.set("learnerId", learnerId || userEmail);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data);
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
