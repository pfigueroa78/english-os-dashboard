import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const demoMode = process.env.E2E_DEMO === "1";

export default demoMode
  ? function middleware() {
      return NextResponse.next();
    }
  : clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
