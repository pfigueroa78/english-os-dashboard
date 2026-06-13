#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const PDF_PATH = getArg("--pdf") || "knowledge/passages-level-1-students-book-3nbsped-9781107447004_compress.pdf";
const OUTPUT_DIR = getArg("--output-dir") || "knowledge/page-images";
const PAGE_MAP = getArg("--page-map") || "knowledge/passages-level-1-students-book-page-map.md";
const FROM = numberArg("--from");
const TO = numberArg("--to");
const DPI = numberArg("--dpi") || 140;
const FORCE = args.includes("--force") || args.includes("--fresh");

function getArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function numberArg(name) {
  const value = getArg(name);
  return value ? Number(value) : null;
}

function pad3(value) {
  return String(value).padStart(3, "0");
}

function getMaxPageFromPageMap() {
  if (!fs.existsSync(PAGE_MAP)) return null;
  const text = fs.readFileSync(PAGE_MAP, "utf8");
  const matches = Array.from(text.matchAll(/PDF_PAGE\s+(\d+)/g)).map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : null;
}

function ensurePdftoppm() {
  try {
    execFileSync("pdftoppm", ["-h"], { stdio: "ignore" });
  } catch {
    throw new Error("Missing pdftoppm. Install poppler-utils locally, then run this script again.");
  }
}

function renderPage(page) {
  const outputFile = path.join(OUTPUT_DIR, `pdf-page-${pad3(page)}.png`);
  if (fs.existsSync(outputFile) && !FORCE) {
    return { page, outputFile, cached: true };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "passages-page-"));
  const prefix = path.join(tmpDir, "page");

  execFileSync("pdftoppm", ["-png", "-r", String(DPI), "-f", String(page), "-l", String(page), PDF_PATH, prefix], {
    stdio: "pipe",
  });

  const generated = fs.readdirSync(tmpDir).find((name) => name.endsWith(".png"));
  if (!generated) throw new Error(`pdftoppm did not render page ${page}.`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.copyFileSync(path.join(tmpDir, generated), outputFile);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return { page, outputFile, cached: false };
}

function main() {
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`PDF not found: ${PDF_PATH}. Pass it with --pdf /path/to/book.pdf`);
  }

  ensurePdftoppm();

  const maxPage = getMaxPageFromPageMap();
  const from = FROM || 1;
  const to = TO || maxPage;

  if (!to) throw new Error("Could not infer final page. Pass --to N or provide the page map.");
  if (from > to) throw new Error(`Invalid range: --from ${from} is greater than --to ${to}.`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (let page = from; page <= to; page += 1) {
    results.push(renderPage(page));
  }

  console.log(JSON.stringify({ ok: true, pdf: PDF_PATH, outputDir: OUTPUT_DIR, dpi: DPI, from, to, pages: results.length, results }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
