import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { renderPromptTemplate, assertPromptVariables } from "../../src/modules/coach-prompts/promptRenderer";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("coach prompt templates live outside page source", async () => {
  const source = read("src/app/coach/page.tsx");
  const pageController = read("src/modules/coach-page/useCoachPageController.ts");
  const learningActions = read("src/modules/coach-learning-actions/application.ts");
  const grammarGuide = read("public/prompts/coach/unit-grammar-guide.md");
  const startClass = read("public/prompts/coach/start-current-class.md");

  expect(grammarGuide).toContain("No menciones Passages");
  expect(startClass).toContain("No hagas cierre");
  expect(learningActions).toContain("renderClientPrompt");
  expect(learningActions).toContain("coach.startCurrentClass");
  expect(pageController).toContain("buildStartTodayClassMessage");
  expect(source).not.toContain("Haz solo una apertura estratégica por etapas: objetivo, por qué importa");
  expect(source).not.toContain("Hazla como una guía compacta por prioridades");
});

test("agent system prompts live outside API source", async () => {
  const route = read("src/app/api/english-os/agents/route.ts");
  const grammarSystem = read("public/prompts/agents/grammar-corrector-system.md");
  const contextMessage = read("public/prompts/agents/context-message.md");

  expect(grammarSystem).toContain("You are the English OS Grammar Corrector.");
  expect(contextMessage).toContain("USER MESSAGE:");
  expect(route).toContain("systemPromptId");
  expect(route).toContain("renderServerPrompt");
  expect(route).not.toContain("You are the English OS Grammar Corrector.");
  expect(route).not.toContain("Response format:");
  expect(route).not.toContain("USER MESSAGE:\n${message}");
});

test("prompt renderer replaces variables and rejects missing required variables", async () => {
  const template = "Unit: {{unit}}\nLesson: {{lesson}}";

  expect(renderPromptTemplate(template, { unit: "Unit 4", lesson: "Time clauses" })).toBe("Unit: Unit 4\nLesson: Time clauses");
  expect(() => assertPromptVariables(template, { unit: "Unit 4" })).toThrow(/lesson/);
});
