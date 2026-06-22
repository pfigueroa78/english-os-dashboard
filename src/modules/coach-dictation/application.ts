import type { CoachApiClient } from "@/modules/coach-api/coachApiClient";
import { createDictationFormData, isDictationAudioTooShort } from "@/modules/coach-media/coachMedia";

export type CoachDictationResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function transcribeCoachDictation(params: {
  api: Pick<CoachApiClient, "transcribeAudio">;
  audioBlob: Blob;
}): Promise<CoachDictationResult> {
  if (isDictationAudioTooShort(params.audioBlob)) {
    return {
      ok: false,
      error: "No escuche suficiente audio. Intenta hablar un poco mas cerca del microfono.",
    };
  }

  try {
    const data = await params.api.transcribeAudio(createDictationFormData(params.audioBlob));
    const text = String(data.text || "").trim();
    if (!text) {
      return {
        ok: false,
        error: "No pude convertir el audio en texto util. Intenta hablar mas claro y con menos ruido de fondo.",
      };
    }
    return { ok: true, text };
  } catch {
    return {
      ok: false,
      error: "No pude transcribir el audio. Puedes escribir tu respuesta o intentar de nuevo.",
    };
  }
}
