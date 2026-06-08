import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const TOKEN = process.env.ENGLISH_OS_TOKEN;

export async function POST(request: NextRequest) {
  try {
    if (!BASE_URL || !TOKEN) {
      return NextResponse.json(
        { ok: false, error: "Missing English OS environment variables." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const {
      userEmail,
      learnerId,
      documentType,
      targetFolderKey,
      sourceAgent,
      unit,
      lesson,
      notes,
    } = body;

    if (!userEmail || !documentType || !targetFolderKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing userEmail, documentType, or targetFolderKey.",
        },
        { status: 400 }
      );
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("token", TOKEN);
    url.searchParams.set("action", "createDocument");
    url.searchParams.set("userEmail", userEmail);
    url.searchParams.set("learnerId", learnerId || userEmail);
    url.searchParams.set("documentType", documentType);
    url.searchParams.set("targetFolderKey", targetFolderKey);

    if (sourceAgent) url.searchParams.set("sourceAgent", sourceAgent);
    if (unit) url.searchParams.set("unit", unit);
    if (lesson) url.searchParams.set("lesson", lesson);
    if (notes) url.searchParams.set("notes", notes);

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
