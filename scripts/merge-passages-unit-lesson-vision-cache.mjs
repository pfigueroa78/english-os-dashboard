#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const UNIT = numberArg("--unit");
const CLASS_PACK_DIR = getArg("--class-pack-dir") || "knowledge/class-packs";
const UNIT_LESSON_CACHE_DIR = getArg("--unit-lesson-cache-dir") || "knowledge/unit-lesson-vision-cache";
const OUTPUT_DIR = getArg("--output-dir") || "knowledge/class-packs-lesson-vision";
const IN_PLACE = args.includes("--in-place");

const START = "<!-- UNIT_LESSON_VISION_CONTEXT_START -->";
const END = "<!-- UNIT_LESSON_VISION_CONTEXT_END -->";

function getArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function numberArg(name) {
  const value = getArg(name);
  return value ? Number(value) : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseRange(value) {
  const match = String(value || "").match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (!match) {
    const single = String(value || "").match(/\d+/);
    return single ? [Number(single[0])] : [];
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  const pages = [];
  for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) pages.push(page);
  return pages;
}

function rangesOverlap(a = [], b = []) {
  return a.some((value) => b.includes(value));
}

function parseClassPack(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const unit = Number(text.match(/-\s*Unit:\s*(\d+)/i)?.[1] || 0);
  const localClass = Number(text.match(/-\s*Local class inside unit:\s*(\d+)/i)?.[1] || 0);
  const globalClass = Number(text.match(/-\s*Global English OS class:\s*(\d+)/i)?.[1] || 0);
  const bookPages = text.match(/-\s*Book pages:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const pdfPages = text.match(/-\s*PDF pages:\s*([^\n]+)/i)?.[1]?.trim() || "";
  return {
    text,
    unit,
    localClass,
    globalClass,
    bookPages,
    pdfPages,
    bookPageNumbers: parseRange(bookPages),
    pdfPageNumbers: parseRange(pdfPages),
    filename: path.basename(filePath),
    filePath,
  };
}

function listText(items, formatter) {
  if (!Array.isArray(items) || !items.length) return "- Not identified.";
  return items.map(formatter).join("\n");
}

function valueList(items) {
  if (!Array.isArray(items) || !items.length) return "Not identified.";
  return items.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("; ");
}

function uniqueValues(items) {
  return Array.from(new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

function loadUnitMap(unit) {
  const filePath = path.join(UNIT_LESSON_CACHE_DIR, `unit-${pad2(unit)}-lesson-map.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findLessonForPack(pack, unitMap) {
  const lessons = unitMap?.analysis?.lessons || [];
  if (!lessons.length) return null;

  return lessons.find((lesson) => rangesOverlap(pack.pdfPageNumbers, parseRange(lesson.pdfPages))) ||
    lessons.find((lesson) => rangesOverlap(pack.bookPageNumbers, parseRange(lesson.bookPages))) ||
    null;
}

function activeSectionsForPack(pack, lesson) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  return sections.filter((section) => {
    return rangesOverlap(pack.pdfPageNumbers, parseRange(section.pdfPages)) ||
      rangesOverlap(pack.bookPageNumbers, parseRange(section.bookPages));
  });
}

function activePlanForPack(pack, lesson) {
  const plans = Array.isArray(lesson?.sectionToClassPlan) ? lesson.sectionToClassPlan : [];
  return plans.filter((plan) => {
    const global = Number(plan.globalClass || plan.globalClassNumber || 0);
    const local = Number(plan.localClass || plan.localClassNumber || 0);
    return global === pack.globalClass || local === pack.localClass;
  });
}

function renderSection(section) {
  return [
    `- Section: ${section.sectionName || section.name || "Unnamed section"}`,
    `  - Book pages: ${section.bookPages || "not specified"}`,
    `  - PDF pages: ${section.pdfPages || "not specified"}`,
    `  - Purpose: ${section.purpose || "not specified"}`,
    `  - Central grammar: ${section.centralGrammar || "not specified"}`,
    `  - Central function: ${section.centralFunction || "not specified"}`,
    `  - Vocabulary: ${valueList(section.vocabulary)}`,
    `  - Target structures: ${valueList(section.targetStructures)}`,
    `  - Exercise types: ${valueList(section.exerciseTypes)}`,
    `  - Expected learner production: ${section.expectedLearnerProduction || section.learnerProduction || "not specified"}`,
  ].join("\n");
}

function renderLessonContextBlock(pack, lesson) {
  const activeSections = activeSectionsForPack(pack, lesson);
  const activePlan = activePlanForPack(pack, lesson);
  const activeSectionNames = uniqueValues(activeSections.map((section) => section.sectionName || section.name));
  const activeGrammar = uniqueValues(activeSections.map((section) => section.centralGrammar));
  const activeFunctions = uniqueValues(activeSections.map((section) => section.centralFunction));
  const activeVocabulary = uniqueValues(activeSections.flatMap((section) => Array.isArray(section.vocabulary) ? section.vocabulary : []));
  const activeTargets = uniqueValues(activeSections.flatMap((section) => Array.isArray(section.targetStructures) ? section.targetStructures : []));

  return `${START}

## Unit-level lesson vision context
This block was generated from full-unit page-image analysis. It provides the full lesson context. Teach only the active class sections.

### Active class teaching contract
- Active class: Unit ${pack.unit}, local class ${pack.localClass}, global class ${pack.globalClass}
- Active class book pages: ${pack.bookPages || "not specified"}
- Active class PDF pages: ${pack.pdfPages || "not specified"}
- Active class section names: ${activeSectionNames.length ? activeSectionNames.join(" + ") : "Not identified"}
- Active class grammar focus: ${activeGrammar.length ? activeGrammar.join("; ") : lesson?.grammarFocus || "Not identified"}
- Active class functions: ${activeFunctions.length ? activeFunctions.join("; ") : "Not identified"}
- Active class vocabulary focus: ${activeVocabulary.length ? activeVocabulary.slice(0, 18).join("; ") : "Not identified"}
- Active class target structures: ${activeTargets.length ? activeTargets.slice(0, 10).join("; ") : "Not identified"}

### Full lesson context
- Unit theme: ${lesson?.unitTheme || "See unit map."}
- Lesson label: ${lesson?.lessonLabel || "not identified"}
- Lesson title: ${lesson?.lessonTitle || "not identified"}
- Full lesson book pages: ${lesson?.bookPages || "not identified"}
- Full lesson PDF pages: ${lesson?.pdfPages || "not identified"}
- Lesson goal: ${lesson?.lessonGoal || "not identified"}
- Lesson grammar focus: ${lesson?.grammarFocus || "not identified"}
- Lesson vocabulary focus: ${valueList(lesson?.vocabularyFocus)}
- Lesson functions: ${valueList(lesson?.functions)}

### Active class sections to teach now
${listText(activeSections, renderSection)}

### Active class teaching plan
${listText(activePlan, (plan) => `- Class plan: ${typeof plan === "string" ? plan : JSON.stringify(plan)}`)}

### Full lesson sections
${listText(lesson?.sections || [], renderSection)}

### Unit-level lesson context rule
Use the full lesson context to understand continuity across Starting point, Listening, Grammar, Discussion, Vocabulary, Speaking, and Writing. Teach only the active class sections and do not teach sections assigned to later classes unless needed as short context. In the learner-visible header, the Class sections line must match Active class section names exactly.

${END}`;
}

function mergeBlock(text, block) {
  const existing = new RegExp(`${START}[\\s\\S]*?${END}`, "m");
  if (existing.test(text)) return text.replace(existing, block);

  const marker = "## Extracted Student Book content";
  const index = text.indexOf(marker);
  if (index >= 0) {
    return `${text.slice(0, index).trim()}\n\n${block}\n\n${text.slice(index).trim()}\n`;
  }

  return `${text.trim()}\n\n${block}\n`;
}

function main() {
  if (!fs.existsSync(CLASS_PACK_DIR)) throw new Error(`Class pack directory not found: ${CLASS_PACK_DIR}`);
  if (!fs.existsSync(UNIT_LESSON_CACHE_DIR)) throw new Error(`Unit lesson cache directory not found: ${UNIT_LESSON_CACHE_DIR}`);
  if (!IN_PLACE) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs.readdirSync(CLASS_PACK_DIR).filter((name) => name.endsWith(".md"));
  const results = [];
  const unitMaps = new Map();

  for (const filename of files) {
    const filePath = path.join(CLASS_PACK_DIR, filename);
    const pack = parseClassPack(filePath);

    if (UNIT && pack.unit !== UNIT) {
      if (!IN_PLACE) fs.copyFileSync(filePath, path.join(OUTPUT_DIR, filename));
      results.push({ filename, merged: false, reason: "Different unit" });
      continue;
    }

    if (!unitMaps.has(pack.unit)) unitMaps.set(pack.unit, loadUnitMap(pack.unit));
    const unitMap = unitMaps.get(pack.unit);
    const lesson = findLessonForPack(pack, unitMap);

    if (!lesson) {
      if (!IN_PLACE) fs.copyFileSync(filePath, path.join(OUTPUT_DIR, filename));
      results.push({ filename, merged: false, reason: "No matching unit lesson context" });
      continue;
    }

    const block = renderLessonContextBlock(pack, lesson);
    const merged = mergeBlock(pack.text, block);
    const outputPath = IN_PLACE ? filePath : path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, merged);
    results.push({ filename, merged: true, lessonTitle: lesson.lessonTitle, outputPath });
  }

  console.log(JSON.stringify({ ok: true, unit: UNIT || "all", inPlace: IN_PLACE, files: files.length, outputDir: IN_PLACE ? CLASS_PACK_DIR : OUTPUT_DIR, results }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
