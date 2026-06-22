import { expect, test } from "@playwright/test";
import { transcribeCoachDictation } from "../../src/modules/coach-dictation/application";

function audioBlob(size: number) {
  return new Blob([new Uint8Array(size)], { type: "audio/webm" });
}

test("dictation application returns clean transcript text", async () => {
  let called = false;
  const result = await transcribeCoachDictation({
    audioBlob: audioBlob(1800),
    api: {
      async transcribeAudio(formData: FormData) {
        called = true;
        expect(formData.get("audio")).toBeTruthy();
        expect(formData.get("language")).toBe("en");
        return { text: "  I work better in the morning.  " };
      },
    },
  });

  expect(called).toBe(true);
  expect(result).toEqual({ ok: true, text: "I work better in the morning." });
});

test("dictation application rejects audio that is too short before calling the API", async () => {
  let called = false;
  const result = await transcribeCoachDictation({
    audioBlob: audioBlob(900),
    api: {
      async transcribeAudio() {
        called = true;
        return { text: "noise" };
      },
    },
  });

  expect(called).toBe(false);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain("suficiente audio");
});

test("dictation application handles empty transcripts and API failures", async () => {
  const empty = await transcribeCoachDictation({
    audioBlob: audioBlob(1800),
    api: {
      async transcribeAudio() {
        return { text: "   " };
      },
    },
  });

  const failed = await transcribeCoachDictation({
    audioBlob: audioBlob(1800),
    api: {
      async transcribeAudio() {
        throw new Error("network");
      },
    },
  });

  expect(empty.ok).toBe(false);
  expect(failed.ok).toBe(false);
  if (!empty.ok) expect(empty.error).toContain("texto util");
  if (!failed.ok) expect(failed.error).toContain("transcribir");
});
