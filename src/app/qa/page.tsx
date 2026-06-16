"use client";

import { useEffect, useState } from "react";
import { EnglishOSV02Experience } from "@/components/EnglishOSV02Experience";
import { getQaFetchHeaders, readQaSession, type QaSession } from "@/lib/qaClient";

export default function QAStudentModePage() {
  const [qaSession, setQaSession] = useState<QaSession>({ active: false, token: "", email: "pfigueroamiranda@gmail.com" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setQaSession(readQaSession());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return <ShellCard>Loading QA student mode...</ShellCard>;
  }

  if (!qaSession.active) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-8 max-w-md w-full text-center space-y-5">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300">English OS QA</p>
            <h1 className="text-3xl font-bold mt-2">QA Student Mode</h1>
          </div>
          <p className="text-slate-400">
            Open this route with a valid qa_token. The learner experience is the same UI, but write actions are simulated.
          </p>
          <code className="block rounded-2xl bg-slate-950 p-4 text-left text-xs text-slate-300">
            /qa?qa_token=YOUR_TOKEN&amp;qa_email=pfigueroamiranda@gmail.com
          </code>
        </div>
      </main>
    );
  }

  return (
    <EnglishOSV02Experience
      email={qaSession.email}
      learnerName="Pedro"
      apiPath="/api/english-os/v02-qa"
      apiHeaders={getQaFetchHeaders(qaSession)}
      qaMode
      userMenu={<span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">QA Student</span>}
    />
  );
}

function ShellCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">{children}</div>
    </main>
  );
}
