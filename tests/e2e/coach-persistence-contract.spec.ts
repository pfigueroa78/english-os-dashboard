import { test, expect } from "@playwright/test";
import {
  getCoachConversationStorageKey,
  loadCoachConversation,
  loadCoachPreferences,
  sanitizeCoachMessages,
  saveCoachConversation,
  saveCoachPreferences,
} from "../../src/modules/coach-persistence/coachPersistence";

function memoryStorage(initial: Record<string, string> = {}) {
  const state = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => state.get(key) ?? null,
    setItem: (key: string, value: string) => state.set(key, value),
    removeItem: (key: string) => state.delete(key),
    dump: () => Object.fromEntries(state.entries()),
  };
}

test("coach persistence loads and saves only stable UI preferences", () => {
  const storage = memoryStorage({
    "english-os-coach-theme": "sand",
    "english-os-coach-text-size": "compact",
    "english-os-coach-sidebar": "closed",
    "english-os-coach-sidebar-width": "420",
  });

  expect(loadCoachPreferences(storage, { isSmallViewport: false })).toEqual({
    theme: "sand",
    textSize: "compact",
    sidebarOpen: false,
    sidebarWidth: 420,
  });

  saveCoachPreferences(storage, { theme: "blue", textSize: "large", sidebarOpen: true, sidebarWidth: 900 });
  expect(storage.dump()).toMatchObject({
    "english-os-coach-theme": "blue",
    "english-os-coach-text-size": "large",
    "english-os-coach-sidebar": "open",
    "english-os-coach-sidebar-width": "560",
  });
});

test("coach persistence defaults the sidebar closed on mobile only when no user preference exists", () => {
  expect(loadCoachPreferences(memoryStorage(), { isSmallViewport: true })).toEqual({ sidebarOpen: false });
  expect(loadCoachPreferences(memoryStorage(), { isSmallViewport: false })).toEqual({});
  expect(loadCoachPreferences(memoryStorage({ "english-os-coach-sidebar": "open" }), { isSmallViewport: true })).toEqual({
    sidebarOpen: true,
  });
  expect(loadCoachPreferences(memoryStorage({ "english-os-coach-sidebar-width": "120" }), { isSmallViewport: false })).toEqual({
    sidebarWidth: 260,
  });
});

test("coach persistence stores learner conversations without ephemeral images or invalid records", () => {
  const key = getCoachConversationStorageKey("learner@example.com");
  const storage = memoryStorage();

  saveCoachConversation(
    storage,
    key,
    [
      { role: "coach", content: "Teacher text", image: { dataUrl: "data:image/png;base64,abc" } },
      { role: "user", content: "Learner text", extra: "ignored" },
      { role: "system", content: "bad" },
      { role: "coach", content: 123 },
    ],
    { maxMessages: 10 },
  );

  expect(JSON.parse(storage.getItem(key) || "[]")).toEqual([
    { role: "coach", content: "Teacher text" },
    { role: "user", content: "Learner text" },
  ]);
  expect(loadCoachConversation(storage, key)).toEqual([
    { role: "coach", content: "Teacher text" },
    { role: "user", content: "Learner text" },
  ]);
});

test("coach persistence clears corrupt conversation payloads", () => {
  const key = getCoachConversationStorageKey("learner@example.com");
  const storage = memoryStorage({ [key]: "{bad json" });

  expect(loadCoachConversation(storage, key)).toEqual([]);
  expect(storage.getItem(key)).toBeNull();
  expect(sanitizeCoachMessages([{ role: "coach", content: "ok" }, null])).toEqual([{ role: "coach", content: "ok" }]);
});
