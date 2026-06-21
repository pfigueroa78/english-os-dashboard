import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const demoMode = process.env.E2E_DEMO === "1";
const localDevelopment = process.env.NODE_ENV !== "production" || process.env.ENGLISH_OS_LOCAL_AUTH_BYPASS === "1";

export default demoMode || localDevelopment
  ? function proxy() {
      return NextResponse.next();
    }
  : clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
