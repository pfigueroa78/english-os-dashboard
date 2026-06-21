export type CoachStoredMessage = {
  role: "user" | "coach";
  content: string;
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: number;
  };
};

export type CoachStoredTheme = "slate" | "paper" | "sage" | "sand" | "blue";
export type CoachStoredTextSize = "compact" | "normal" | "large";

export type CoachPreferences = {
  theme?: CoachStoredTheme;
  textSize?: CoachStoredTextSize;
  sidebarOpen?: boolean;
};

const THEME_STORAGE_KEY = "english-os-coach-theme";
const TEXT_SIZE_STORAGE_KEY = "english-os-coach-text-size";
const SIDEBAR_STORAGE_KEY = "english-os-coach-sidebar";
const VALID_THEMES: CoachStoredTheme[] = ["slate", "paper", "sage", "sand", "blue"];
const VALID_TEXT_SIZES: CoachStoredTextSize[] = ["compact", "normal", "large"];

export function getCoachConversationStorageKey(email: string | null | undefined) {
  return email ? `english-os-coach:${email}` : "";
}

export function loadCoachPreferences(
  storage: Pick<Storage, "getItem">,
  params: { isSmallViewport: boolean },
): CoachPreferences {
  const storedTheme = storage.getItem(THEME_STORAGE_KEY);
  const storedTextSize = storage.getItem(TEXT_SIZE_STORAGE_KEY);
  const storedSidebar = storage.getItem(SIDEBAR_STORAGE_KEY);
  const preferences: CoachPreferences = {};

  if (isCoachStoredTheme(storedTheme)) preferences.theme = storedTheme;
  if (isCoachStoredTextSize(storedTextSize)) preferences.textSize = storedTextSize;

  if (storedSidebar === "closed") {
    preferences.sidebarOpen = false;
  } else if (storedSidebar === "open") {
    preferences.sidebarOpen = true;
  } else if (params.isSmallViewport) {
    preferences.sidebarOpen = false;
  }

  return preferences;
}

export function saveCoachPreferences(
  storage: Pick<Storage, "setItem">,
  preferences: Required<Pick<CoachPreferences, "theme" | "textSize" | "sidebarOpen">>,
) {
  storage.setItem(THEME_STORAGE_KEY, preferences.theme);
  storage.setItem(TEXT_SIZE_STORAGE_KEY, preferences.textSize);
  storage.setItem(SIDEBAR_STORAGE_KEY, preferences.sidebarOpen ? "open" : "closed");
}

export function loadCoachConversation(
  storage: Pick<Storage, "getItem" | "removeItem">,
  storageKey: string,
) {
  if (!storageKey) return [];
  const saved = storage.getItem(storageKey);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Conversation storage is not an array.");
    return sanitizeCoachMessages(parsed);
  } catch {
    storage.removeItem(storageKey);
    return [];
  }
}

export function saveCoachConversation(
  storage: Pick<Storage, "setItem">,
  storageKey: string,
  messages: unknown[],
  params: { maxMessages?: number } = {},
) {
  if (!storageKey || messages.length === 0) return;
  const maxMessages = params.maxMessages ?? 40;
  const sanitized = sanitizeCoachMessages(messages).slice(-maxMessages);
  storage.setItem(storageKey, JSON.stringify(sanitized));
}

export function sanitizeCoachMessages(messages: unknown[]): CoachStoredMessage[] {
  return messages.flatMap((message) => {
    if (!isRecord(message)) return [];
    if (message.role !== "user" && message.role !== "coach") return [];
    if (typeof message.content !== "string") return [];
    const sanitized: CoachStoredMessage = {
      role: message.role,
      content: message.content,
    };
    if (isUsage(message.usage)) sanitized.usage = message.usage;
    return [sanitized];
  });
}

function isCoachStoredTheme(value: unknown): value is CoachStoredTheme {
  return typeof value === "string" && VALID_THEMES.includes(value as CoachStoredTheme);
}

function isCoachStoredTextSize(value: unknown): value is CoachStoredTextSize {
  return typeof value === "string" && VALID_TEXT_SIZES.includes(value as CoachStoredTextSize);
}

function isUsage(value: unknown): value is CoachStoredMessage["usage"] {
  if (!isRecord(value)) return false;
  return (
    typeof value.model === "string" &&
    typeof value.inputTokens === "number" &&
    typeof value.outputTokens === "number" &&
    typeof value.totalTokens === "number" &&
    typeof value.estimatedCostUSD === "number"
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
