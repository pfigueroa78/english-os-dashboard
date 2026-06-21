import { test, expect } from "@playwright/test";
import {
  chooseMediaRecorderMimeType,
  cleanTextForSpeech,
  createSpeechPayload,
  extractSpeechRecognitionTranscript,
  getDictationAudioExtension,
  isDictationAudioTooShort,
  mergeDictationTranscript,
  selectBestEnglishSpeechVoice,
} from "../../src/modules/coach-media/coachMedia";

test("coach media prepares readable text and selects the best English voice", () => {
  expect(cleanTextForSpeech("## Title\n\n**Hello** [Pedro](https://example.com) `now`")).toBe("Title Hello Pedro now");

  const voices = [
    { lang: "es-CO", name: "Spanish Local", localService: true },
    { lang: "en-GB", name: "Basic English", localService: true },
    { lang: "en-US", name: "Microsoft Aria Natural", localService: false },
  ];

  expect(selectBestEnglishSpeechVoice(voices)?.name).toBe("Microsoft Aria Natural");
  expect(createSpeechPayload("Hello **there**", voices)).toMatchObject({
    text: "Hello there",
    lang: "en-US",
    rate: 0.94,
    pitch: 1.02,
    voice: voices[2],
  });
  expect(createSpeechPayload("```hidden```", voices)).toBeNull();
});

test("coach media merges useful dictation and rejects noise-like transcripts", () => {
  expect(mergeDictationTranscript("I think", "  this is useful  ")).toEqual({
    ok: true,
    value: "I think this is useful",
  });
  expect(mergeDictationTranscript("", "123 !!!")).toEqual({ ok: false, value: "" });
  expect(isDictationAudioTooShort({ size: 900 })).toBe(true);
  expect(isDictationAudioTooShort({ size: 1800 })).toBe(false);
});

test("coach media chooses stable recorder formats and transcript text", () => {
  expect(chooseMediaRecorderMimeType((mimeType) => mimeType === "audio/webm")).toBe("audio/webm");
  expect(chooseMediaRecorderMimeType(() => false)).toBe("");
  expect(getDictationAudioExtension("audio/mp4")).toBe("m4a");
  expect(getDictationAudioExtension("audio/ogg;codecs=opus")).toBe("ogg");
  expect(getDictationAudioExtension("audio/webm;codecs=opus")).toBe("webm");
  expect(
    extractSpeechRecognitionTranscript({
      results: [[{ transcript: "Hello" }], [{ transcript: "from the microphone" }]],
    }),
  ).toBe("Hello from the microphone");
});
