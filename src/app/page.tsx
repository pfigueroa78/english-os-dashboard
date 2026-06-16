"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { EnglishOSV02Experience } from "@/components/EnglishOSV02Experience";
import type { ReactNode } from "react";

export default function EnglishOSV02Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "";
  const learnerName = user?.firstName || user?.fullName || "Pedro";

  if (!isLoaded) {
    return <ShellCard>Loading English OS...</ShellCard>;
  }

  if (!isSignedIn || !email) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-8 max-w-md w-full text-center space-y-5">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">English OS v0.2</p>
            <h1 className="text-3xl font-bold mt-2">Adaptive Learning UX</h1>
          </div>
          <p className="text-slate-400">
            Sign in to continue your current class, practice recurring mistakes, and get automatic session feedback.
          </p>
          <SignInButton mode="redirect">
            <button className="rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 hover:bg-sky-400">
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <EnglishOSV02Experience
      email={email}
      learnerName={learnerName}
      apiPath="/api/english-os/v02"
      userMenu={<UserButton />}
    />
  );
}

function ShellCard({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">{children}</div>
    </main>
  );
}
