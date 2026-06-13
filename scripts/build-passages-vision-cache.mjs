#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_VISION_CACHE_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";

const args = process.argv.slice(2);
const FORCE = args.includes("--force") || args.includes("--fresh");
const DRY_RUN = args.includes("--dry-run");
const CLASS_PACK_DIR = getArg("--class-pack-dir") || "knowledge/class-packs";
const IMAGE_DIR = getArg("--image-dir") || "knowledge/page-images";
const OUTPUT_DIR = getArg("--output-dir") || "knowledge/vision-cache";
const ONLY_UNIT = numberArg("--unit");
const ONLY_LOCAL_CLASS = numberArg("--class") || numberArg("--local-class");
const ONLY_GLOBAL_CLASS = numberArg("--global-class");

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
    `pdf-page-${String(page).padStart(3, "0")}.png`,
    `pdf-page-${String(page).padStart(3, "0")}.jpg`,
    `pdf-page-${String(page).padStart(3, "0")}.jpeg`,
    `pdf-page-${String(page).padStart(3, "0")}.webp`,
    `pdf-page-${page}.png`,
    `pdf-page-${page}.jpg`,
    `page-${String(page).padStart(3, "0")}.png`,
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
    textPreview: text.slice(0, 5000),
  };
}

function cachePathFor(pack) {
  return path.join(
    OUTPUT_DIR,
    `unit-${pad2(pack.unit)}-local-class-${pad2(pack.localClass)}-global-class-${pad2(pack.globalClass)}.json`,
  );
}

function getClassPacks() {
  if (!fs.existsSync(CLASS_PACK_DIR)) {
    throw new Error(`Class pack directory not found: ${CLASS_PACK_DIR}`);
  }

  return fs
    .readdirSync(CLASS_PACK_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => parseClassPack(path.join(CLASS_PACK_DIR, name)))
    .filter((pack) => pack.unit && pack.localClass && pack.globalClass)
    .filter((pack) => !ONLY_UNIT || pack.unit === ONLY_UNIT)
    .filter((pack) => !ONLY_LOCAL_CLASS || pack.localClass === ONLY_LOCAL_CLASS)
    .filter((pack) => !ONLY_GLOBAL_CLASS || pack.globalClass === ONLY_GLOBAL_CLASS)
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

function normalizeAnalysis(raw) {
  const analysis = raw && typeof raw === "object" ? raw : {};

  return {
    lessonTitle: analysis.lessonTitle || null,
    mainFocus: analysis.mainFocus || null,
    centralGrammar: analysis.centralGrammar || null,
    centralFunction: analysis.centralFunction || null,
    centralStructureFormula: analysis.centralStructureFormula || null,
    requiredPracticeFrames: Array.isArray(analysis.requiredPracticeFrames) ? analysis.requiredPracticeFrames : [],
    avoidPatterns: Array.isArray(analysis.avoidPatterns) ? analysis.avoidPatterns : [],
    targetStructures: Array.isArray(analysis.targetStructures) ? analysis.targetStructures : [],
    vocabulary: Array.isArray(analysis.vocabulary) ? analysis.vocabulary : [],
    exerciseTypes: Array.isArray(analysis.exerciseTypes) ? analysis.exerciseTypes : [],
    speakingTasks: Array.isArray(analysis.speakingTasks) ? analysis.speakingTasks : [],
    visualLayoutNotes: analysis.visualLayoutNotes || null,
    sourceConfidence: analysis.sourceConfidence || null,
    evidenceNotes: analysis.evidenceNotes || null,
  };
}

async function analyzeWithVision(pack, imagePaths) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");

  const content = [
    {
      type: "input_text",
      text: [
        "Analyze these Student Book page images for an English class.",
        "Return JSON only. Do not quote long copyrighted text. Paraphrase.",
        "Infer the pedagogical target from the page layout, titles, grammar boxes, prompts, examples, and exercises.",
        "Use the text preview only as supporting metadata; the images are the main evidence.",
        "Prioritize the central grammar/function that learners must produce, not just the topic.",
        "If a grammar box, function box, repeated sentence frame, or controlled practice pattern appears, extract the reusable formula.",
        "Required JSON fields:",
        "lessonTitle, mainFocus, centralGrammar, centralFunction, centralStructureFormula, requiredPracticeFrames, avoidPatterns, targetStructures, vocabulary, exerciseTypes, speakingTasks, visualLayoutNotes, sourceConfidence, evidenceNotes.",
        "centralStructureFormula: one clean reusable formula learners can use, or null if there is no formula.",
        "requiredPracticeFrames: array of 3 to 6 sentence frames that directly practice the central structure/function.",
        "avoidPatterns: array of common malformed structures or misleading patterns the coach should avoid.",
        "targetStructures must be an array of objects with name, meaning, form, exampleIdeas, likelyMistakes.",
        "vocabulary must be an array of objects with item, meaning, usefulness.",
        "Do not include full page transcriptions.",
        "Class metadata:",
        JSON.stringify({
          unit: pack.unit,
          localClass: pack.localClass,
          globalClass: pack.globalClass,
          bookPages: pack.bookPages,
          pdfPages: pack.pdfPages,
          lessonType: pack.lessonType,
          filename: pack.filename,
        }),
        "Class text preview:",
        pack.textPreview,
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
      max_output_tokens: 2000,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI vision request failed.");

  const outputText = data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || "";
  return normalizeAnalysis(safeJsonFromText(outputText));
}

async function main() {
  const packs = getClassPacks();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];

  for (const pack of packs) {
    const outputPath = cachePathFor(pack);
    const pdfPageNumbers = parseRange(pack.pdfPages);
    const imagePaths = pdfPageNumbers.map(findPageImage).filter(Boolean);

    if (!imagePaths.length) {
      results.push({ ok: false, skipped: true, reason: "No page images found", class: pack.globalClass, pdfPages: pack.pdfPages });
      continue;
    }

    if (fs.existsSync(outputPath) && !FORCE) {
      results.push({ ok: true, cached: true, class: pack.globalClass, outputPath });
      continue;
    }

    const payload = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      model: MODEL,
      classPack: {
        filename: pack.filename,
        unit: pack.unit,
        localClass: pack.localClass,
        globalClass: pack.globalClass,
        bookPages: pack.bookPages,
        pdfPages: pack.pdfPages,
      },
      images: imagePaths.map((filePath) => ({
        file: path.relative(process.cwd(), filePath),
        sha256: sha256File(filePath),
      })),
      analysis: DRY_RUN ? null : await analyzeWithVision(pack, imagePaths),
    };

    if (!DRY_RUN) fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    results.push({ ok: true, generated: !DRY_RUN, class: pack.globalClass, outputPath, images: imagePaths.length });
  }

  console.log(JSON.stringify({ ok: true, model: MODEL, packs: packs.length, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
