import { NextResponse } from "next/server";
import { createCoachSessionContract, legacyActiveClass, legacyActiveUnit } from "@/modules/coach-session/contract";
import type { CoachSessionMode } from "@/modules/coach-session/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_E2E_DEMO !== "1") {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = String(body.mode || "class") as CoachSessionMode;
  const session = createCoachSessionContract({
    mode,
    savedUnit: body.savedUnit ?? "Unit 4",
    savedLesson: body.savedLesson ?? "Business advice speaking practice: expanding advice with contrast",
    activeUnit: body.activeUnit,
    activeClassNumber: body.activeClassNumber,
    lessonTitle: body.lessonTitle,
    resourcesUnit: body.resourcesUnit,
    source: "contract_probe",
  });

  return NextResponse.json({
    ok: true,
    session,
    activeUnit: legacyActiveUnit(session),
    activeClass: legacyActiveClass(session),
  });
}

