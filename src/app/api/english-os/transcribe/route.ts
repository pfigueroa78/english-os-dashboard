import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  if (!OPENAI_API_KEY) {
    return jsonError("Missing OPENAI_API_KEY.", 500);
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  const language = String(formData.get("language") || "en").slice(0, 8);

  if (!(audio instanceof File)) {
    return jsonError("Missing audio file.");
  }

  if (audio.size <= 0) {
    return jsonError("Empty audio file.");
  }

  if (audio.size > 12 * 1024 * 1024) {
    return jsonError("Audio file is too large.", 413);
  }

  const outbound = new FormData();
  outbound.append("file", audio, audio.name || "english-os-dictation.webm");
  outbound.append("model", "gpt-4o-mini-transcribe");
  outbound.append("language", language);
  outbound.append(
    "prompt",
    "The speaker is an English learner practicing B1/B2 professional English with an AI coach. Transcribe only what the speaker says.",
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: outbound,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return jsonError(data?.error?.message || "OpenAI transcription failed.", response.status);
  }

  const text = String(data?.text || "").replace(/\s+/g, " ").trim();
  return NextResponse.json({ ok: true, text });
}
