import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { loadClassPack, loadUnitClassPacks } from "@/lib/classPacks";

export const runtime = "nodejs";

function numberParam(url: URL, key: string, fallback = 0) {
  const value = Number(url.searchParams.get(key) || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const unit = numberParam(url, "unit", 4);
  const localClass = numberParam(url, "localClass", 7);
  const globalClass = numberParam(url, "globalClass", (unit - 1) * 7 + localClass);
  const includeUnit = url.searchParams.get("includeUnit") === "1";

  const currentClassPack = loadClassPack(unit, localClass, globalClass);

  return NextResponse.json(
    {
      ok: currentClassPack.ok,
      currentClassPack,
      unitClassPacks: includeUnit ? loadUnitClassPacks(unit) : undefined,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
