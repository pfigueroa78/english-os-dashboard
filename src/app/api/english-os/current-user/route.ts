import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.ENGLISH_OS_BASE_URL;
const TOKEN = process.env.ENGLISH_OS_TOKEN;

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

    const url = new URL(BASE_URL);
    url.searchParams.set("token", TOKEN);
    url.searchParams.set("action", "getLearnerContext");
    url.searchParams.set("userEmail", email);
    url.searchParams.set("learnerId", email);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    const active = String(data?.user?.["Active"] || "").toLowerCase();
    const authorized = Boolean(data?.user) && active !== "false";

    return NextResponse.json({
      ok: true,
      authenticated: true,
      authorized,
      email,
      englishOS: data,
      role: data?.user?.["Role"] || "learner",
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
