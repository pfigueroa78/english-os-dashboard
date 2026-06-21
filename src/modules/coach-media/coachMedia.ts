export type CoachVocabularyImage = {
  dataUrl: string;
  name?: string;
  mimeType?: string;
};

export type CoachSpeechVoiceLike = {
  lang?: string;
  name?: string;
  localService?: boolean;
};

export type CoachSpeechPayload<TVoice> = {
  text: string;
  lang: "en-US";
  rate: number;
  pitch: number;
  voice: TVoice | null;
};

const MIN_DICTATION_AUDIO_BYTES = 1200;
const PREFERRED_AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function cleanTextForSpeech(content: string) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectBestEnglishSpeechVoice<TVoice extends CoachSpeechVoiceLike>(voices: TVoice[]) {
  if (!voices.length) return null;
  const preferredName = /(natural|neural|online|premium|jenny|aria|guy|samantha|google|microsoft|apple)/i;
  const englishVoices = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ""));
  const candidates = englishVoices.length ? englishVoices : voices;
  return candidates
    .map((voice) => {
      const langScore = /^en-US/i.test(voice.lang || "") ? 4 : /^en-GB/i.test(voice.lang || "") ? 3 : /^en/i.test(voice.lang || "") ? 2 : 0;
      const nameScore = preferredName.test(voice.name || "") ? 4 : 0;
      const localScore = voice.localService ? 1 : 0;
      return { voice, score: langScore + nameScore + localScore };
    })
    .sort((a, b) => b.score - a.score)[0]?.voice || null;
}

export function createSpeechPayload<TVoice extends CoachSpeechVoiceLike>(
  content: string,
  voices: TVoice[],
): CoachSpeechPayload<TVoice> | null {
  const text = cleanTextForSpeech(content);
  if (!text) return null;
  return {
    text,
    lang: "en-US",
    rate: 0.94,
    pitch: 1.02,
    voice: selectBestEnglishSpeechVoice(voices),
  };
}

export function cleanDictationTranscript(transcript: string) {
  return String(transcript || "").replace(/\s+/g, " ").trim();
}

export function mergeDictationTranscript(currentInput: string, transcript: string) {
  const cleaned = cleanDictationTranscript(transcript);
  if (!cleaned || !/[a-záéíóúñü]/i.test(cleaned)) {
    return { ok: false as const, value: currentInput };
  }
  const current = String(currentInput || "").trim();
  return {
    ok: true as const,
    value: [current, cleaned].filter(Boolean).join(current ? " " : ""),
  };
}

export function isDictationAudioTooShort(audioBlob: Pick<Blob, "size">) {
  return audioBlob.size < MIN_DICTATION_AUDIO_BYTES;
}

export function getDictationAudioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function createDictationFormData(audioBlob: Blob) {
  const formData = new FormData();
  const mimeType = audioBlob.type || "audio/webm";
  formData.append("audio", audioBlob, `english-os-dictation.${getDictationAudioExtension(mimeType)}`);
  formData.append("language", "en");
  return formData;
}

export function chooseMediaRecorderMimeType(isTypeSupported: (mimeType: string) => boolean) {
  return PREFERRED_AUDIO_MIME_TYPES.find((type) => isTypeSupported(type)) || "";
}

export function extractSpeechRecognitionTranscript(event: any) {
  return Array.from(event?.results || [])
    .map((result: any) => result?.[0]?.transcript || "")
    .join(" ")
    .trim();
}

export async function prepareImageForVocabulary(
  file: File,
  params: { maxSide?: number; quality?: number } = {},
): Promise<CoachVocabularyImage> {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);
  const maxSide = params.maxSide ?? 1280;
  const quality = params.quality ?? 0.82;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No pude procesar la imagen.");
  context.drawImage(image, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), name: file.name, mimeType: "image/jpeg" };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No pude leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(sourceDataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No pude preparar la imagen."));
    img.src = sourceDataUrl;
  });
}
