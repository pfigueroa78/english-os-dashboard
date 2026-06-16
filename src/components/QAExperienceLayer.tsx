"use client";

import { useEffect, useState } from "react";
import { readQaSession, type QaSession } from "@/lib/qaClient";
import { QAExperienceTools } from "@/components/QAExperienceTools";

export function QAExperienceLayer() {
  const [qaSession, setQaSession] = useState<QaSession>({ active: false, token: "", email: "pfigueroamiranda@gmail.com" });

  useEffect(() => {
    setQaSession(readQaSession());
  }, []);

  if (!qaSession.active) return null;

  return <QAExperienceTools qaSession={qaSession} />;
}
