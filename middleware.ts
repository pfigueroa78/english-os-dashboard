import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/english-os/coach") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/english-os/coach-pedagogy";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/english-os/coach"],
};
