#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const inputPdf =
  process.env.PASSAGES_PDF_PATH ||
  process.argv[2] ||
  "knowledge/passages-level-1-students-book.pdf";

const outputDir =
  process.env.PASSAGES_PAGE_IMAGES_DIR ||
  process.argv[3] ||
  "knowledge/page-images";

const startPage = Number(process.env.PASSAGES_START_PDF_PAGE || 1);
const endPage = Number(process.env.PASSAGES_END_PDF_PAGE || 999);

function ensureTool() {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "pdftoppm is required. Install it with: sudo apt-get update && sudo apt-get install -y poppler-utils"
    );
  }
}

function pad3(value) {
  return String(value).padStart(3, "0");
}

function renderPage(pdfPath, pageNumber, dir) {
  const prefix = path.join(dir, `pdf-page-${pad3(pageNumber)}`);

  execFileSync("pdftoppm", [
    "-png",
    "-r",
    "180",
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    pdfPath,
    prefix,
  ]);

  const generated = `${prefix}-${pageNumber}.png`;
  const normalized = path.join(dir, `pdf-page-${pad3(pageNumber)}.png`);

  if (fs.existsSync(generated)) {
    fs.renameSync(generated, normalized);
  }

  return normalized;
}

function main() {
  const absolutePdf = path.resolve(inputPdf);
  const absoluteOutputDir = path.resolve(outputDir);

  if (!fs.existsSync(absolutePdf)) {
    throw new Error(`PDF not found: ${absolutePdf}`);
  }

  ensureTool();
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  const rendered = [];

  for (let page = startPage; page <= endPage; page += 1) {
    try {
      const file = renderPage(absolutePdf, page, absoluteOutputDir);
      rendered.push(file);
    } catch (error) {
      if (page === startPage) throw error;
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputPdf: absolutePdf,
        outputDir: absoluteOutputDir,
        rendered: rendered.length,
        first: rendered[0],
        last: rendered[rendered.length - 1],
      },
      null,
      2
    )
  );
}

main();
