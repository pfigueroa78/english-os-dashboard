#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const WEBAPP = process.env.ENGLISH_OS_BASE_URL || process.env.WEBAPP || "";
const TOKEN = process.env.ENGLISH_OS_TOKEN || process.env.TOKEN || "";

const pageMapPath = process.env.PASSAGES_PAGE_MAP_PATH || process.argv[2] || "knowledge/passages-level-1-students-book-page-map.md";
const outputPath = process.env.PASSAGES_CLASS_PACKS_PATH || process.argv[3] || "knowledge/passages-class-packs.md";
const cachePath = process.env.PASSAGES_COURSE_INDEX_CACHE_PATH || "knowledge/course-class-index.json";

function normalizeNumber(value) {
  const number = Number(String(value || "").trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function compact(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function parsePageMap(markdown) {
  const pageBlocks = new Map();
  const marker = /^## PDF_PAGE\s+(\d+)\s+\|\s+BOOK_PAGE\s+([^\n]+)$/gm;
  const matches = [...markdown.matchAll(marker)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const pdfPage = Number(match[1]);
    const bookPage = String(match[2]).trim();
    const start = match.index || 0;
    const end = i + 1 < matches.length ? matches[i + 1].index || markdown.length : markdown.length;
    const block = compact(markdown.slice(start, end));

    pageBlocks.set(pdfPage, {
      pdfPage,
      bookPage,
      text: block,
    });
  }

  return pageBlocks;
}

async function fetchCourseClassIndexFromEnglishOS() {
  if (!WEBAPP || !TOKEN) {
    throw new Error(
      "Missing ENGLISH_OS_BASE_URL/ENGLISH_OS_TOKEN or WEBAPP/TOKEN. Export them or provide knowledge/course-class-index.json."
    );
  }

  const all = [];

  for (let unit = 1; unit <= 12; unit += 1) {
    const url = new URL(WEBAPP);
    url.searchParams.set("token", TOKEN);
    url.searchParams.set("action", "getCourseClassIndex");
    url.searchParams.set("unit", String(unit));

    const response = await fetch(url.toString(), { method: "GET" });
    const data = await response.json();

    if (!response.ok || !data.ok || !Array.isArray(data.items)) {
      throw new Error(`Unable to fetch Course Class Index for unit ${unit}: ${JSON.stringify(data)}`);
    }

    all.push(...data.items);
  }

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(all, null, 2), "utf8");

  return all;
}

async function loadCourseClassIndex() {
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  }

  return fetchCourseClassIndexFromEnglishOS();
}

function deriveLocalClassNumber(globalClassNumber, unit) {
  const globalNumber = normalizeNumber(globalClassNumber);
  const unitNumber = normalizeNumber(unit);

  if (!globalNumber || !unitNumber) return "";

  return String(globalNumber - (unitNumber - 1) * 7);
}

function collectPageText(pageBlocks, start, end) {
  const chunks = [];

  for (let page = start; page <= end; page += 1) {
    const block = pageBlocks.get(page);
    if (block?.text) chunks.push(block.text);
  }

  return compact(chunks.join("\n\n"));
}

function buildClassPack(row, pageBlocks) {
  const unit = normalizeNumber(row.unit ?? row.Unit);
  const globalClass = normalizeNumber(row.classNumber ?? row.Class ?? row.class);
  const localClass = deriveLocalClassNumber(globalClass, unit);
  const pdfStart = normalizeNumber(row.pdfInitialPage ?? row["PDF Initial Page"]);
  const pdfEnd = normalizeNumber(row.pdfFinalPage ?? row["PDF Final Page"]);
  const bookStart = normalizeNumber(row.bookInitialPage ?? row["Book Initial Page"]);
  const bookEnd = normalizeNumber(row.bookFinalPage ?? row["Book Final Page"]);
  const specialClass = String(row.specialClass ?? row["Special Class"] ?? "").trim();
  const notes = String(row.notes ?? row.Notes ?? "").trim();
  const lessonType = specialClass || "Student Book class";

  if (!unit || !globalClass) return "";

  const classPackId = `CLASS_PACK_UNIT_${pad2(unit)}_CLASS_${pad2(globalClass)}`;
  const localPackId = localClass ? `UNIT_${pad2(unit)}_LOCAL_CLASS_${pad2(localClass)}` : "";
  const pageRangeId = pdfStart && pdfEnd ? `PDF_PAGE_RANGE_${pdfStart}_${pdfEnd}` : "PDF_PAGE_RANGE_NONE";
  const bookRangeId = bookStart && bookEnd ? `BOOK_PAGE_RANGE_${bookStart}_${bookEnd}` : "BOOK_PAGE_RANGE_NONE";
  const pageText = pdfStart && pdfEnd ? collectPageText(pageBlocks, pdfStart, pdfEnd) : "";

  return `
---

# ${classPackId}

Aliases: ${[
    classPackId,
    localPackId,
    `GLOBAL_CLASS_${globalClass}`,
    `UNIT_${unit}_CLASS_${globalClass}`,
    localClass ? `UNIT_${unit}_CLASS_${localClass}_LOCAL` : "",
    pageRangeId,
    bookRangeId,
  ].filter(Boolean).join(" | ")}

Metadata:
- Unit: ${unit}
- Local class inside unit: ${localClass || "unknown"}
- Global English OS class: ${globalClass}
- Lesson type: ${lessonType}
- Book pages: ${bookStart && bookEnd ? `${bookStart}-${bookEnd}` : "not indexed"}
- PDF pages: ${pdfStart && pdfEnd ? `${pdfStart}-${pdfEnd}` : "not indexed"}
- Notes: ${notes || "none"}

Teacher retrieval instruction:
Use this class pack as the primary source when the learner asks for Unit ${unit}, Class ${localClass || globalClass}, or English OS Class ${globalClass}. Teach the content as a live class, not as a dump.

## Extracted Student Book content

${pageText || "No direct Student Book page text is indexed for this class. Use the special class metadata and available course index context."}
`.trim();
}

async function main() {
  const absolutePageMapPath = path.resolve(pageMapPath);
  const absoluteOutputPath = path.resolve(outputPath);

  if (!fs.existsSync(absolutePageMapPath)) {
    throw new Error(`Page map not found: ${absolutePageMapPath}. Run scripts/build-passages-page-map.mjs first.`);
  }

  const pageMap = fs.readFileSync(absolutePageMapPath, "utf8");
  const pageBlocks = parsePageMap(pageMap);
  const courseIndex = await loadCourseClassIndex();

  if (!Array.isArray(courseIndex) || !courseIndex.length) {
    throw new Error("Course Class Index is empty.");
  }

  const packs = courseIndex
    .map((row) => buildClassPack(row, pageBlocks))
    .filter(Boolean);

  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(
    absoluteOutputPath,
    [
      "# Passages Level 1 - English OS Class Packs",
      "",
      "Generated automatically from Course Class Index and the page-aware PDF text map.",
      "Use CLASS_PACK_UNIT_XX_CLASS_YY markers for exact class retrieval.",
      "",
      ...packs,
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(JSON.stringify({
    ok: true,
    pageMapPath: absolutePageMapPath,
    outputPath: absoluteOutputPath,
    cachedCourseIndexPath: path.resolve(cachePath),
    pageBlocks: pageBlocks.size,
    classPacks: packs.length,
    bytes: fs.statSync(absoluteOutputPath).size,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
