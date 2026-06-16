import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const demoMode = process.env.NEXT_PUBLIC_E2E_DEMO === "1";

export default demoMode ? function middleware() { return NextResponse.next(); } : clerkMiddleware();
