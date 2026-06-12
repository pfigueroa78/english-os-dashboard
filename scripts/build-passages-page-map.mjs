#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const inputPdf = process.env.PASSAGES_PDF_PATH || process.argv[2] || "knowledge/passages-level-1-students-book.pdf";
const outputMd = process.env.PASSAGES_PAGE_MAP_PATH || process.argv[3] || "knowledge/passages-level-1-students-book-page-map.md";
const startPage = Number(process.env.PASSAGES_START_PDF_PAGE || 1);
const endPage = Number(process.env.PASSAGES_END_PDF_PAGE || 999);

function ensurePdftotext() {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "pdftotext is required. Install it with: sudo apt-get update && sudo apt-get install -y poppler-utils"
    );
  }
}

function extractPageText(pdfPath, pageNumber) {
  const tempFile = path.join(os.tmpdir(), `passages-page-${pageNumber}-${Date.now()}.txt`);

  execFileSync("pdftotext", [
    "-layout",
    "-enc",
    "UTF-8",
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    pdfPath,
    tempFile,
  ]);

  const text = fs.readFileSync(tempFile, "utf8");
  fs.rmSync(tempFile, { force: true });

  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function inferBookPage(pdfPage) {
  // Based on Course Class Index: PDF page 11 corresponds to book page 2.
  // Therefore bookPage = pdfPage - 9 for the main Student's Book content.
  const bookPage = pdfPage - 9;
  return bookPage > 0 ? String(bookPage) : "front-matter";
}

function build() {
  const absolutePdf = path.resolve(inputPdf);
  const absoluteOutput = path.resolve(outputMd);

  if (!fs.existsSync(absolutePdf)) {
    throw new Error(`PDF not found: ${absolutePdf}`);
  }

  ensurePdftotext();

  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });

  const chunks = [];
  chunks.push("# Passages Level 1 Student's Book - Page Map");
  chunks.push("");
  chunks.push("This file is generated from the local PDF for page-aware retrieval in OpenAI File Search.");
  chunks.push("Each page has explicit PDF_PAGE and BOOK_PAGE markers so class retrieval can target exact pages.");
  chunks.push("");

  for (let page = startPage; page <= endPage; page += 1) {
    let pageText = "";

    try {
      pageText = extractPageText(absolutePdf, page);
    } catch (error) {
      if (page === startPage) throw error;
      break;
    }

    if (!pageText) continue;

    chunks.push(`\n---\n`);
    chunks.push(`## PDF_PAGE ${page} | BOOK_PAGE ${inferBookPage(page)}`);
    chunks.push(`PDF_PAGE: ${page}`);
    chunks.push(`BOOK_PAGE: ${inferBookPage(page)}`);
    chunks.push("");
    chunks.push(pageText);
  }

  fs.writeFileSync(absoluteOutput, chunks.join("\n"), "utf8");

  console.log(JSON.stringify({
    ok: true,
    inputPdf: absolutePdf,
    outputMd: absoluteOutput,
    startPage,
    endPageRequested: endPage,
    bytes: fs.statSync(absoluteOutput).size,
  }, null, 2));
}

build();
