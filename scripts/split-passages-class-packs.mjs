#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const inputPath = process.env.PASSAGES_CLASS_PACKS_PATH || process.argv[2] || "knowledge/passages-class-packs.md";
const outputDir = process.env.PASSAGES_CLASS_PACKS_DIR || process.argv[3] || "knowledge/class-packs";

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function extractNumber(pattern, text) {
  const match = text.match(pattern);
  return match?.[1] ? Number(match[1]) : null;
}

function main() {
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutputDir = path.resolve(outputDir);

  if (!fs.existsSync(absoluteInput)) {
    throw new Error(`Class packs file not found: ${absoluteInput}`);
  }

  const content = fs.readFileSync(absoluteInput, "utf8");
  const chunks = content.split(/\n---\n+/g).map((chunk) => chunk.trim()).filter(Boolean);
  const packs = chunks.filter((chunk) => /^# CLASS_PACK_UNIT_\d{2}_CLASS_\d{2}/m.test(chunk));

  fs.rmSync(absoluteOutputDir, { recursive: true, force: true });
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  const written = [];

  for (const pack of packs) {
    const idMatch = pack.match(/^# (CLASS_PACK_UNIT_(\d{2})_CLASS_(\d{2}))/m);
    if (!idMatch) continue;

    const classPackId = idMatch[1];
    const unit = Number(idMatch[2]);
    const globalClass = Number(idMatch[3]);
    const localClass = extractNumber(/Local class inside unit:\s*(\d+)/, pack) || (globalClass - (unit - 1) * 7);
    const bookPages = (pack.match(/Book pages:\s*([^\n]+)/)?.[1] || "unknown").trim();
    const pdfPages = (pack.match(/PDF pages:\s*([^\n]+)/)?.[1] || "unknown").trim();

    const filename = `unit-${pad2(unit)}-local-class-${pad2(localClass)}-global-class-${pad2(globalClass)}-${slug(classPackId)}.md`;
    const filePath = path.join(absoluteOutputDir, filename);

    const enriched = [
      `# ${classPackId}`,
      "",
      `Filename retrieval key: ${filename}`,
      `Exact retrieval key: ${classPackId}`,
      `Unit retrieval key: UNIT_${pad2(unit)}`,
      `Local class retrieval key: UNIT_${pad2(unit)}_LOCAL_CLASS_${pad2(localClass)}`,
      `Global class retrieval key: GLOBAL_CLASS_${globalClass}`,
      `Book pages retrieval key: BOOK_PAGES_${bookPages.replace(/[^0-9]+/g, "_")}`,
      `PDF pages retrieval key: PDF_PAGES_${pdfPages.replace(/[^0-9]+/g, "_")}`,
      "",
      "Teacher instruction: Use this file as the primary source for this exact class. Do not substitute content from another class.",
      "",
      pack.replace(/^# CLASS_PACK_UNIT_\d{2}_CLASS_\d{2}\n?/, ""),
      "",
    ].join("\n");

    fs.writeFileSync(filePath, enriched, "utf8");
    written.push(filePath);
  }

  console.log(JSON.stringify({
    ok: true,
    inputPath: absoluteInput,
    outputDir: absoluteOutputDir,
    classPackFiles: written.length,
    first: written[0],
    last: written[written.length - 1],
  }, null, 2));
}

main();
