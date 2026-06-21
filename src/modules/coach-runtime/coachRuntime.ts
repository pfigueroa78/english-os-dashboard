import { createSpeechPayload, extractSpeechRecognitionTranscript, mergeDictationTranscript } from "@/modules/coach-media/coachMedia";

export type MutableRef<T> = {
  current: T;
};

export type StateSetter<T> = (value: T) => void;
export type InputSetter = (updater: (current: string) => string) => void;

export function focusTextareaSoon(textareaRef: MutableRef<HTMLTextAreaElement | null>, delay = 0) {
  globalThis.setTimeout(() => textareaRef.current?.focus(), delay);
}

export function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

export function stopCoachThinkingRuntime(params: {
  coachAbortRef: MutableRef<AbortController | null>;
  agentAbortRef: MutableRef<AbortController | null>;
  setLoading: StateSetter<boolean>;
  setAgentLoading: StateSetter<boolean>;
}) {
  params.coachAbortRef.current?.abort();
  params.agentAbortRef.current?.abort();
  params.coachAbortRef.current = null;
  params.agentAbortRef.current = null;
  params.setLoading(false);
  params.setAgentLoading(false);
}

export function insertDictationTranscript(params: {
  transcript: string;
  setInput: InputSetter;
  textareaRef: MutableRef<HTMLTextAreaElement | null>;
}) {
  let inserted = false;
  params.setInput((current) => {
    const next = mergeDictationTranscript(current, params.transcript);
    inserted = next.ok;
    return next.value;
  });
  if (!inserted) return false;
  focusTextareaSoon(params.textareaRef);
  return true;
}

export function speakCoachMessageRuntime(params: {
  content: string;
  index: number;
  windowObj: Window;
  setError: StateSetter<string>;
  setSpeakingMessageIndex: StateSetter<number | null>;
  setSpeechPaused: StateSetter<boolean>;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
}) {
  if (!("speechSynthesis" in params.windowObj)) {
    params.setError("Tu navegador no soporta lectura en voz alta.");
    return false;
  }

  const speech = createSpeechPayload(params.content, params.windowObj.speechSynthesis.getVoices());
  if (!speech) return false;

  const createUtterance = params.createUtterance || ((text: string) => new SpeechSynthesisUtterance(text));
  params.windowObj.speechSynthesis.cancel();
  const utterance = createUtterance(speech.text);
  utterance.lang = speech.lang;
  utterance.voice = speech.voice;
  utterance.rate = speech.rate;
  utterance.pitch = speech.pitch;
  utterance.onend = () => {
    params.setSpeakingMessageIndex(null);
    params.setSpeechPaused(false);
  };
  utterance.onerror = () => {
    params.setSpeakingMessageIndex(null);
    params.setSpeechPaused(false);
  };
  params.setSpeakingMessageIndex(params.index);
  params.setSpeechPaused(false);
  params.windowObj.speechSynthesis.speak(utterance);
  return true;
}

export function toggleCoachSpeechRuntime(params: {
  content: string;
  index: number;
  speakingMessageIndex: number | null;
  speechPaused: boolean;
  windowObj: Window;
  setError: StateSetter<string>;
  setSpeakingMessageIndex: StateSetter<number | null>;
  setSpeechPaused: StateSetter<boolean>;
  speakMessage: (content: string, index: number) => boolean | void;
}) {
  if (!("speechSynthesis" in params.windowObj)) {
    params.setError("Tu navegador no soporta lectura en voz alta.");
    return false;
  }

  if (params.speakingMessageIndex === params.index && params.windowObj.speechSynthesis.speaking && !params.speechPaused) {
    params.windowObj.speechSynthesis.pause();
    params.setSpeechPaused(true);
    return true;
  }

  if (params.speakingMessageIndex === params.index && params.speechPaused) {
    params.windowObj.speechSynthesis.resume();
    params.setSpeechPaused(false);
    return true;
  }

  params.speakMessage(params.content, params.index);
  return true;
}

export function stopCoachSpeechRuntime(params: {
  windowObj: Window;
  setSpeakingMessageIndex: StateSetter<number | null>;
  setSpeechPaused: StateSetter<boolean>;
}) {
  if (!("speechSynthesis" in params.windowObj)) return false;
  params.windowObj.speechSynthesis.cancel();
  params.setSpeakingMessageIndex(null);
  params.setSpeechPaused(false);
  return true;
}

export function stopMediaDictationRuntime(params: {
  mediaRecorderRef: MutableRef<MediaRecorder | null>;
  mediaStreamRef: MutableRef<MediaStream | null>;
  textareaRef: MutableRef<HTMLTextAreaElement | null>;
  setListening: StateSetter<boolean>;
}) {
  const recorder = params.mediaRecorderRef.current;
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
  params.mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  params.mediaStreamRef.current = null;
  params.mediaRecorderRef.current = null;
  params.setListening(false);
  focusTextareaSoon(params.textareaRef);
}

export function startBrowserDictationRuntime(params: {
  windowObj: Window & Record<string, any>;
  recognitionRef: MutableRef<any>;
  textareaRef: MutableRef<HTMLTextAreaElement | null>;
  setListening: StateSetter<boolean>;
  setError: StateSetter<string>;
  insertDictationText: (transcript: string) => boolean;
}) {
  const SpeechRecognition = params.windowObj.SpeechRecognition || params.windowObj.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    params.setError("Tu navegador no soporta dictado por micrófono. Puedes escribir tu respuesta normalmente.");
    return false;
  }

  if (params.recognitionRef.current) {
    params.recognitionRef.current.stop();
    params.recognitionRef.current = null;
    params.setListening(false);
    focusTextareaSoon(params.textareaRef);
    return true;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;
  recognition.onresult = (event: any) => {
    const transcript = extractSpeechRecognitionTranscript(event);
    if (transcript && !params.insertDictationText(transcript)) {
      params.setError("No pude convertir el audio en texto útil. Intenta hablar más claro y con menos ruido.");
    }
  };
  recognition.onerror = () => {
    params.setError("No pude escuchar el micrófono. Revisa permisos del navegador e intenta otra vez.");
  };
  recognition.onend = () => {
    params.recognitionRef.current = null;
    params.setListening(false);
    focusTextareaSoon(params.textareaRef);
  };
  params.recognitionRef.current = recognition;
  params.setListening(true);
  try {
    recognition.start();
    focusTextareaSoon(params.textareaRef);
    return true;
  } catch {
    params.recognitionRef.current = null;
    params.setListening(false);
    params.setError("No pude iniciar el micrófono. Revisa permisos del navegador e intenta otra vez.");
    focusTextareaSoon(params.textareaRef);
    return false;
  }
}
