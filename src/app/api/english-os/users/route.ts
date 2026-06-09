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
        { ok: false, authenticated: true, authorized: false, error: "No email found." },
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
          error: "Admin access required.",
        },
        { status: 403 }
      );
    }

    const usersUrl = new URL(BASE_URL);
    usersUrl.searchParams.set("token", TOKEN);
    usersUrl.searchParams.set("action", "listUsers");

    const usersResponse = await fetch(usersUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const usersData = await usersResponse.json();

    return NextResponse.json({
      ok: true,
      authenticated: true,
      authorized: true,
      role,
      users: usersData.users || [],
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
