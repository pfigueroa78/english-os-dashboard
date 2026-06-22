import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildHintMessage,
  buildStartTodayClassMessage,
  buildUnitGrammarGuideMessage,
  buildUnitVocabularyGuideMessage,
} from "../../src/modules/coach-learning-actions/application";

test.beforeEach(() => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.startsWith("/prompts/")) return originalFetch(input);
    const text = await readFile(join(process.cwd(), "public", url.replace(/^\//, "")), "utf8");
    return new Response(text, { status: 200 });
  };
});

test("learning actions build start-class prompts without leaking UI concerns", async () => {
  const prompt = await buildStartTodayClassMessage("Unit 4", "Business advice speaking practice");

  expect(prompt).toContain("unidad 4");
  expect(prompt).toContain("no inventes Class 1");
  expect(prompt).toContain("Business advice speaking practice");
  expect(prompt).not.toContain("viewing_current_class");
  expect(prompt).not.toContain("Student Book page range");
});

test("learning actions build guide and hint requests from the active unit", async () => {
  const grammar = await buildUnitGrammarGuideMessage("Unit 4");
  const vocabulary = await buildUnitVocabularyGuideMessage("Unit 4");
  const hint = await buildHintMessage("Unit 4", "Class 28");

  expect(grammar).toContain("guia de gramatica de la unidad 4");
  expect(vocabulary).toContain("guia de vocabulario de la unidad 4");
  expect(hint).toContain("Unit 4");
  expect(hint).toContain("Class 28");
});
