import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Validation scope: UI shell + source contracts + pedagogy-first coach routing.
const root = process.cwd();
const packsRoot = path.join(root, "knowledge", "class-packs-lesson-vision");
const promptFile = path.join(root, "src", "lib", "passagesTeacherStyle.ts");

function readFile(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readPack(filename: string) {
  return fs.readFileSync(path.join(packsRoot, filename), "utf8");
}

function activeContract(source: string) {
  const marker = "### Active class teaching contract";
  const start = source.indexOf(marker);
  const end = source.indexOf("### Safety rule", start);
  return start >= 0 ? source.slice(start, end >= 0 ? end : undefined) : "";
}

test("teacher prompt keeps the general pedagogy workflow", async () => {
  const source = fs.readFileSync(promptFile, "utf8");
  const required = [
    "runtime learner context",
    "84 class packs",
    "complete lesson context",
    "Warm-up",
    "Teacher explanation",
    "Controlled practice",
    "Role play",
    "Writing",
    "Evaluation gate",
    "Cambridge-style correction",
    "CEFR",
  ];

  for (const item of required) expect(source).toContain(item);
  expect(source).not.toContain("Critical correction for Unit");
  expect(source).toContain("Cohesive lesson thread");
  expect(source).toContain("Review-mode architecture");
  expect(source).toContain("Never show Global Class numbers");
  expect(source).toContain("Never attribute a teacher-created simulation");
});

test("coach API routes class requests to the pedagogy-first handler", async () => {
  const publicRoute = readFile("src/app/api/english-os/coach/route.ts");
  const route = readFile("src/app/api/english-os/coach-pedagogy/route.ts");
  const handler = readFile("src/lib/coachRouteHandler.ts");

  expect(publicRoute).toContain('export { coachPost as POST } from "@/lib/coachRouteHandler"');
  expect(route).toContain("coachPost");
  expect(handler).toContain("loadClassPack");
  expect(handler).toContain("Local Class Pack + Pedagogy Prompt");
  expect(handler).toContain("Never answer a class request with a metadata table");
  expect(handler).toContain("Unsafe class reply contains metadata marker");
  expect(handler).toContain("loadUnitTeachingContracts");
  expect(handler).toContain("Seven Local Teaching Contracts + Review Pedagogy Prompt");
  expect(handler).toContain("activeUnit: unit");
  expect(handler).toContain("Do not use the class-mode metadata header");
  expect(handler).toContain("finish with exactly four numbered checkpoint items");

  const forbiddenLegacyClassDelivery = [
    "formatCurrentClassContentReply",
    "Clase actual / contenido de clase",
    "Book Content Index",
  ];
  for (const marker of forbiddenLegacyClassDelivery) expect(publicRoute).not.toContain(marker);
});

test("coach UI follows the explicitly requested unit for materials", async () => {
  const source = readFile("src/app/coach/page.tsx");
  expect(source).toContain("data.activeUnit ? `Unit ${data.activeUnit}`");
  expect(source).toContain("setStudyUnit(unit)");
});

test("all 84 class packs expose usable learner-safe teaching contracts", async () => {
  const filenames = fs.readdirSync(packsRoot).filter((filename) => filename.endsWith(".md")).sort();
  expect(filenames).toHaveLength(84);

  const requiredFields = [
    "Active class section names",
    "Active class grammar focus",
    "Active class vocabulary focus",
    "Active class target structures",
    "Expected learner production",
  ];
  const forbidden = [
    "Extract exact",
    "Extract vocabulary",
    "Use the target language from the indexed page range",
    "anchored to Student Book pages",
    "viewing_current_class",
  ];

  for (const filename of filenames) {
    const contract = activeContract(readPack(filename));
    expect(contract, filename).toContain("Active class teaching contract");
    for (const field of requiredFields) expect(contract, `${filename}: ${field}`).toContain(field);
    for (const marker of forbidden) expect(contract, `${filename}: ${marker}`).not.toContain(marker);
  }
});

test("five sampled class packs keep active source contracts", async () => {
  const samples = [
    ["unit-01-local-class-01-global-class-01-class-pack-unit-01-class-01.md", ["Starting point", "Vocabulary & Speaking", "Grammar", "Speaking"], ["gerunds", "personality"]],
    ["unit-01-local-class-04-global-class-04-class-pack-unit-01-class-04.md", ["Starting point", "Listening & Speaking", "Grammar", "Discussion"], ["noun clauses after be", "family"]],
    ["unit-02-local-class-01-global-class-08-class-pack-unit-02-class-08.md", ["Starting point", "Listening", "Grammar", "Discussion"], ["should have", "life lessons"]],
    ["unit-03-local-class-01-global-class-15-class-pack-unit-03-class-15.md", ["Starting point", "Listening"], ["adjective clauses", "cities"]],
    ["unit-04-local-class-02-global-class-23-class-pack-unit-04-class-23.md", ["Listening & Speaking", "Role Play", "Writing"], ["Giving advice", "Effective topic sentences"]],
  ] as const;

  for (const [filename, sections, focusTerms] of samples) {
    const source = readPack(filename);
    const contract = activeContract(source);

    expect(contract, filename).toContain("Active class teaching contract");
    expect(source, filename).toContain("## Extracted Student Book content");
    expect(source, filename).toContain("Exact retrieval key");

    for (const section of sections) expect(contract, `${filename} section ${section}`).toContain(section);
    for (const term of focusTerms) expect(source, `${filename} focus ${term}`).toContain(term);
  }
});

test("Unit 1 Class 2 keeps the full lesson title and treats Changes as an activity focus", async () => {
  const source = readPack("unit-01-local-class-02-global-class-02-class-pack-unit-01-class-02.md");
  const contract = activeContract(source);

  expect(contract).toContain("Lesson title: What kind of person are you?");
  expect(contract).toContain("Listening + Discussion + Writing");
  expect(contract).toContain("not grammar-centered");
  expect(source).toContain("LISTENING");
  expect(source).toContain("Changes");
});

test("contract generation and audit preserve the complete lesson title", async () => {
  const generator = readFile("scripts/generate-passages-teaching-contracts.mjs");
  const audit = readFile("scripts/audit-passages-contracts.mjs");

  expect(generator).toContain("canonicalLessonTitle");
  expect(generator).toContain("Never promote an activity, subsection, listening, reading, or writing heading");
  expect(audit).toContain("does not match full lesson title");
});
