#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_UNIT_LESSON_VISION_MODEL || process.env.OPENAI_VISION_CACHE_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";

const args = process.argv.slice(2);
const UNIT = numberArg("--unit");
const CLASS_PACK_DIR = getArg("--class-pack-dir") || "knowledge/class-packs";
const IMAGE_DIR = getArg("--image-dir") || "knowledge/page-images";
const OUTPUT_DIR = getArg("--output-dir") || "knowledge/unit-lesson-vision-cache";
const FORCE = args.includes("--force") || args.includes("--fresh");
const DRY_RUN = args.includes("--dry-run");

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

function pad3(value) {
  return String(value).padStart(3, "0");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function mimeFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function dataUrl(filePath) {
  const mime = mimeFromFile(filePath);
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${base64}`;
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

function findPageImage(page) {
  const candidates = [
    `pdf-page-${pad3(page)}.png`,
    `pdf-page-${pad3(page)}.jpg`,
    `pdf-page-${pad3(page)}.jpeg`,
    `pdf-page-${pad3(page)}.webp`,
    `pdf-page-${page}.png`,
    `pdf-page-${page}.jpg`,
    `page-${pad3(page)}.png`,
    `page-${page}.png`,
  ];

  for (const filename of candidates) {
    const filePath = path.join(IMAGE_DIR, filename);
    if (fs.existsSync(filePath)) return filePath;
  }

  return null;
}

function parseClassPack(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const unit = Number(text.match(/-\s*Unit:\s*(\d+)/i)?.[1] || 0);
  const localClass = Number(text.match(/-\s*Local class inside unit:\s*(\d+)/i)?.[1] || 0);
  const globalClass = Number(text.match(/-\s*Global English OS class:\s*(\d+)/i)?.[1] || 0);
  const bookPages = text.match(/-\s*Book pages:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const pdfPages = text.match(/-\s*PDF pages:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const lessonType = text.match(/-\s*Lesson type:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const title = text.match(/^#\s*(.+)$/m)?.[1]?.trim() || path.basename(filePath);

  return {
    filePath,
    filename: path.basename(filePath),
    title,
    unit,
    localClass,
    globalClass,
    bookPages,
    pdfPages,
    lessonType,
    pdfPageNumbers: parseRange(pdfPages),
    textPreview: text.slice(0, 3500),
  };
}

function getUnitClassPacks() {
  if (!UNIT) throw new Error("Pass --unit N.");
  if (!fs.existsSync(CLASS_PACK_DIR)) throw new Error(`Class pack directory not found: ${CLASS_PACK_DIR}`);

  return fs
    .readdirSync(CLASS_PACK_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => parseClassPack(path.join(CLASS_PACK_DIR, name)))
    .filter((pack) => pack.unit === UNIT)
    .sort((a, b) => a.globalClass - b.globalClass);
}

function safeJsonFromText(text) {
  const trimmed = String(text || "").trim();
  const withoutFence = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = withoutFence.indexOf("{");
  const last = withoutFence.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error(`No JSON object found in model output: ${trimmed.slice(0, 400)}`);
  return JSON.parse(withoutFence.slice(first, last + 1));
}

function normalizeLessonMap(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const lessons = Array.isArray(data.lessons) ? data.lessons : [];

  return {
    unit: Number(data.unit || UNIT),
    unitTitle: data.unitTitle || null,
    unitTheme: data.unitTheme || null,
    lessons: lessons.map((lesson, index) => ({
      lessonKey: lesson.lessonKey || `lesson_${index + 1}`,
      lessonLabel: lesson.lessonLabel || null,
      lessonTitle: lesson.lessonTitle || null,
      bookPages: lesson.bookPages || null,
      pdfPages: lesson.pdfPages || null,
      lessonGoal: lesson.lessonGoal || null,
      sections: Array.isArray(lesson.sections) ? lesson.sections : [],
      grammarFocus: lesson.grammarFocus || null,
      vocabularyFocus: Array.isArray(lesson.vocabularyFocus) ? lesson.vocabularyFocus : [],
      functions: Array.isArray(lesson.functions) ? lesson.functions : [],
      targetStructures: Array.isArray(lesson.targetStructures) ? lesson.targetStructures : [],
      sectionToClassPlan: Array.isArray(lesson.sectionToClassPlan) ? lesson.sectionToClassPlan : [],
      teachingSequence: Array.isArray(lesson.teachingSequence) ? lesson.teachingSequence : [],
      evidenceNotes: lesson.evidenceNotes || null,
    })),
  };
}

async function analyzeUnitLessonMap(classPacks, imagePaths) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");

  const content = [
    {
      type: "input_text",
      text: [
        "Analyze the full unit pages from an English Student Book.",
        "Return JSON only. Paraphrase; do not transcribe long copyrighted text.",
        "The book is organized by lessons. Lessons are divided into sections such as Starting point, Listening, Grammar, Discussion, Vocabulary, Speaking, and Writing. Sometimes sections are combined.",
        "Your task is to build a unit-level lesson map so a coach can know the whole lesson context, while teaching only the sections assigned to a specific English OS class.",
        "Identify every lesson in the unit, the page span for each lesson, and the sections inside each lesson.",
        "For each section, identify sectionName, bookPages, pdfPages, purpose, centralGrammar, centralFunction, vocabulary, targetStructures, exerciseTypes, and what the learner is expected to produce.",
        "Also map which English OS class should teach which sections using the class metadata. A class may cover one or more sections; a lesson may span several classes.",
        "If a grammar label is visible, preserve the exact grammar label as grammarFocus. Do not replace it with a topic.",
        "Required JSON fields: unit, unitTitle, unitTheme, lessons.",
        "Each lesson must include: lessonKey, lessonLabel, lessonTitle, bookPages, pdfPages, lessonGoal, sections, grammarFocus, vocabularyFocus, functions, targetStructures, sectionToClassPlan, teachingSequence, evidenceNotes.",
        "Class metadata:",
        JSON.stringify(classPacks.map((pack) => ({
          filename: pack.filename,
          title: pack.title,
          unit: pack.unit,
          localClass: pack.localClass,
          globalClass: pack.globalClass,
          bookPages: pack.bookPages,
          pdfPages: pack.pdfPages,
          lessonType: pack.lessonType,
        })), null, 2),
        "Class text previews:",
        classPacks.map((pack) => `---\n${pack.filename}\n${pack.textPreview}`).join("\n"),
      ].join("\n"),
    },
    ...imagePaths.map((filePath) => ({
      type: "input_image",
      image_url: dataUrl(filePath),
      detail: "low",
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "user",
          content,
        },
      ],
      max_output_tokens: 5000,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI unit lesson vision request failed.");

  const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || "";
  return normalizeLessonMap(safeJsonFromText(outputText));
}

async function main() {
  const classPacks = getUnitClassPacks();
  if (!classPacks.length) throw new Error(`No class packs found for unit ${UNIT}.`);

  const pageNumbers = Array.from(new Set(classPacks.flatMap((pack) => pack.pdfPageNumbers))).sort((a, b) => a - b);
  const imagePaths = pageNumbers.map(findPageImage).filter(Boolean);

  if (!imagePaths.length) {
    throw new Error(`No page images found for unit ${UNIT}. Render them first with render-passages-page-images.mjs.`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `unit-${pad2(UNIT)}-lesson-map.json`);

  if (fs.existsSync(outputPath) && !FORCE) {
    console.log(JSON.stringify({ ok: true, cached: true, unit: UNIT, outputPath }, null, 2));
    return;
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    unit: UNIT,
    classPacks: classPacks.map((pack) => ({
      filename: pack.filename,
      unit: pack.unit,
      localClass: pack.localClass,
      globalClass: pack.globalClass,
      bookPages: pack.bookPages,
      pdfPages: pack.pdfPages,
    })),
    images: imagePaths.map((filePath) => ({
      file: path.relative(process.cwd(), filePath),
      sha256: sha256File(filePath),
    })),
    analysis: DRY_RUN ? null : await analyzeUnitLessonMap(classPacks, imagePaths),
  };

  if (!DRY_RUN) fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({ ok: true, generated: !DRY_RUN, unit: UNIT, outputPath, classPacks: classPacks.length, images: imagePaths.length }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
