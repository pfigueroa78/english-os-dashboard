#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const CLASS_PACK_DIR = getArg("--class-pack-dir") || "knowledge/class-packs";
const VISION_CACHE_DIR = getArg("--vision-cache-dir") || "knowledge/vision-cache";
const OUTPUT_DIR = getArg("--output-dir") || "knowledge/class-packs-vision";
const IN_PLACE = args.includes("--in-place");

const START = "<!-- VISION_CACHE_START -->";
const END = "<!-- VISION_CACHE_END -->";

function getArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseClassPack(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const unit = Number(text.match(/-\s*Unit:\s*(\d+)/i)?.[1] || 0);
  const localClass = Number(text.match(/-\s*Local class inside unit:\s*(\d+)/i)?.[1] || 0);
  const globalClass = Number(text.match(/-\s*Global English OS class:\s*(\d+)/i)?.[1] || 0);
  return { text, unit, localClass, globalClass, filename: path.basename(filePath), filePath };
}

function cachePathFor(pack) {
  return path.join(
    VISION_CACHE_DIR,
    `unit-${pad2(pack.unit)}-local-class-${pad2(pack.localClass)}-global-class-${pad2(pack.globalClass)}.json`,
  );
}

function listText(items, formatter) {
  if (!Array.isArray(items) || !items.length) return "- Not identified.";
  return items.map(formatter).join("\n");
}

function renderVisionBlock(cache) {
  const analysis = cache.analysis || {};
  const targetStructures = Array.isArray(analysis.targetStructures) ? analysis.targetStructures : [];
  const vocabulary = Array.isArray(analysis.vocabulary) ? analysis.vocabulary : [];
  const exerciseTypes = Array.isArray(analysis.exerciseTypes) ? analysis.exerciseTypes : [];
  const speakingTasks = Array.isArray(analysis.speakingTasks) ? analysis.speakingTasks : [];

  const targets = listText(targetStructures, (item, index) => {
    const exampleIdeas = Array.isArray(item.exampleIdeas) ? item.exampleIdeas.join("; ") : item.exampleIdeas || "";
    const likelyMistakes = Array.isArray(item.likelyMistakes) ? item.likelyMistakes.join("; ") : item.likelyMistakes || "";
    return [
      `- Target ${index + 1}: ${item.name || "Unnamed target"}`,
      `  - Meaning: ${item.meaning || "Not specified."}`,
      `  - Form: ${item.form || "Not specified."}`,
      `  - Example ideas: ${exampleIdeas || "Not specified."}`,
      `  - Likely mistakes: ${likelyMistakes || "Not specified."}`,
    ].join("\n");
  });

  const vocab = listText(vocabulary, (item) => {
    return `- ${item.item || "item"}: ${item.meaning || ""}${item.usefulness ? ` (${item.usefulness})` : ""}`;
  });

  return `${START}

## Vision-enriched pedagogical cache
This block was generated from cached page-image analysis. Use it to identify the central grammar/function and page layout, but teach in your own words.

- Vision lesson title: ${analysis.lessonTitle || "Not identified."}
- Vision main focus: ${analysis.mainFocus || "Not identified."}
- Vision central grammar: ${analysis.centralGrammar || "Not identified."}
- Vision central function: ${analysis.centralFunction || "Not identified."}
- Vision confidence: ${analysis.sourceConfidence || "Not specified."}

### Vision target structures
${targets}

### Vision vocabulary candidates
${vocab}

### Vision exercise types
${listText(exerciseTypes, (item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`)}

### Vision speaking tasks
${listText(speakingTasks, (item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`)}

### Vision layout notes
${analysis.visualLayoutNotes || "Not available."}

### Vision evidence notes
${analysis.evidenceNotes || "Not available."}

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
  if (!fs.existsSync(VISION_CACHE_DIR)) throw new Error(`Vision cache directory not found: ${VISION_CACHE_DIR}`);

  if (!IN_PLACE) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  const files = fs.readdirSync(CLASS_PACK_DIR).filter((name) => name.endsWith(".md"));

  for (const filename of files) {
    const filePath = path.join(CLASS_PACK_DIR, filename);
    const pack = parseClassPack(filePath);
    const cachePath = cachePathFor(pack);

    if (!pack.unit || !pack.localClass || !pack.globalClass || !fs.existsSync(cachePath)) {
      if (!IN_PLACE) fs.copyFileSync(filePath, path.join(OUTPUT_DIR, filename));
      results.push({ filename, merged: false, reason: "No matching vision cache" });
      continue;
    }

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const block = renderVisionBlock(cache);
    const merged = mergeBlock(pack.text, block);
    const outputPath = IN_PLACE ? filePath : path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, merged);
    results.push({ filename, merged: true, outputPath });
  }

  console.log(JSON.stringify({ ok: true, inPlace: IN_PLACE, classPackDir: CLASS_PACK_DIR, visionCacheDir: VISION_CACHE_DIR, outputDir: IN_PLACE ? CLASS_PACK_DIR : OUTPUT_DIR, files: files.length, results }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
