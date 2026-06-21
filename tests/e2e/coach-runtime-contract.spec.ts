import { test, expect } from "@playwright/test";
import {
  insertDictationTranscript,
  speakCoachMessageRuntime,
  startBrowserDictationRuntime,
  stopCoachSpeechRuntime,
  stopCoachThinkingRuntime,
  toggleCoachSpeechRuntime,
} from "../../src/modules/coach-runtime/coachRuntime";

test("coach runtime stops pending coach and agent thinking together", () => {
  let coachAborted = false;
  let agentAborted = false;
  let loading = true;
  let agentLoading = true;
  const coachAbortRef = { current: { abort: () => { coachAborted = true; } } as AbortController | null };
  const agentAbortRef = { current: { abort: () => { agentAborted = true; } } as AbortController | null };

  stopCoachThinkingRuntime({
    coachAbortRef,
    agentAbortRef,
    setLoading: (value) => { loading = value; },
    setAgentLoading: (value) => { agentLoading = value; },
  });

  expect(coachAborted).toBe(true);
  expect(agentAborted).toBe(true);
  expect(coachAbortRef.current).toBeNull();
  expect(agentAbortRef.current).toBeNull();
  expect(loading).toBe(false);
  expect(agentLoading).toBe(false);
});

test("coach runtime inserts useful dictation and rejects noise", async () => {
  let input = "I usually";
  let focused = false;
  const textareaRef = { current: { focus: () => { focused = true; } } as HTMLTextAreaElement | null };
  const setInput = (updater: (current: string) => string) => {
    input = updater(input);
  };

  expect(insertDictationTranscript({ transcript: "work better in the morning", setInput, textareaRef })).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(input).toBe("I usually work better in the morning");
  expect(focused).toBe(true);

  expect(insertDictationTranscript({ transcript: "12345", setInput, textareaRef })).toBe(false);
  expect(input).toBe("I usually work better in the morning");
});

test("coach runtime controls speech playback without component-side state rules", () => {
  const spoken: any[] = [];
  let cancelled = false;
  let paused = false;
  let resumed = false;
  let speakingIndex: number | null = null;
  let speechPaused = false;
  let error = "";
  const speechSynthesis = {
    speaking: true,
    getVoices: () => [{ lang: "en-US", name: "Microsoft Jenny Natural", localService: false }],
    cancel: () => { cancelled = true; },
    speak: (utterance: any) => spoken.push(utterance),
    pause: () => { paused = true; },
    resume: () => { resumed = true; },
  };
  const windowObj = { speechSynthesis } as unknown as Window;
  const setSpeakingMessageIndex = (value: number | null) => { speakingIndex = value; };
  const setSpeechPaused = (value: boolean) => { speechPaused = value; };

  expect(speakCoachMessageRuntime({
    content: "**Hello** [there](https://example.com)",
    index: 2,
    windowObj,
    setError: (value) => { error = value; },
    setSpeakingMessageIndex,
    setSpeechPaused,
    createUtterance: (text) => ({ text } as SpeechSynthesisUtterance),
  })).toBe(true);

  expect(error).toBe("");
  expect(cancelled).toBe(true);
  expect(speakingIndex).toBe(2);
  expect(speechPaused).toBe(false);
  expect(spoken[0].text).toBe("Hello there");

  expect(toggleCoachSpeechRuntime({
    content: "Hello",
    index: 2,
    speakingMessageIndex: 2,
    speechPaused: false,
    windowObj,
    setError: (value) => { error = value; },
    setSpeakingMessageIndex,
    setSpeechPaused,
    speakMessage: () => false,
  })).toBe(true);
  expect(paused).toBe(true);
  expect(speechPaused).toBe(true);

  expect(toggleCoachSpeechRuntime({
    content: "Hello",
    index: 2,
    speakingMessageIndex: 2,
    speechPaused: true,
    windowObj,
    setError: (value) => { error = value; },
    setSpeakingMessageIndex,
    setSpeechPaused,
    speakMessage: () => false,
  })).toBe(true);
  expect(resumed).toBe(true);
  expect(speechPaused).toBe(false);

  expect(stopCoachSpeechRuntime({ windowObj, setSpeakingMessageIndex, setSpeechPaused })).toBe(true);
  expect(speakingIndex).toBeNull();
});

test("coach runtime starts browser dictation with stable English settings", () => {
  let activeRecognition: any = null;
  let listening = false;
  let inserted = "";
  let error = "";
  let started = false;
  class MockRecognition {
    lang = "";
    interimResults = true;
    continuous = true;
    maxAlternatives = 1;
    onresult?: (event: any) => void;
    onend?: () => void;
    start() {
      started = true;
      this.onresult?.({ results: [[{ transcript: "I need more practice" }]] });
    }
    stop() {
      this.onend?.();
    }
  }
  const windowObj = { SpeechRecognition: MockRecognition, setTimeout } as unknown as Window & Record<string, any>;

  expect(startBrowserDictationRuntime({
    windowObj,
    recognitionRef: {
      get current() { return activeRecognition; },
      set current(value) { activeRecognition = value; },
    },
    textareaRef: { current: null },
    setListening: (value) => { listening = value; },
    setError: (value) => { error = value; },
    insertDictationText: (value) => {
      inserted = value;
      return true;
    },
  })).toBe(true);

  expect(started).toBe(true);
  expect(listening).toBe(true);
  expect(error).toBe("");
  expect(inserted).toBe("I need more practice");
  expect(activeRecognition.lang).toBe("en-US");
  expect(activeRecognition.interimResults).toBe(false);
  expect(activeRecognition.continuous).toBe(false);
  expect(activeRecognition.maxAlternatives).toBe(3);
});

