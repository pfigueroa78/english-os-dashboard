#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const hasArg = (name) => args.includes(name);

const knowledgePath = argValue("--knowledge-path", "knowledge/class-packs-lesson-vision");
const unitFilter = Number(argValue("--unit", "0")) || 0;
const failOnWarnings = hasArg("--fail-on-warnings");
const outputJson = hasArg("--json");
const contractReportPath = argValue("--contract-report", "knowledge/passages-contract-audit.json");
const contractReport = fs.existsSync(contractReportPath) ? JSON.parse(fs.readFileSync(contractReportPath, "utf8")) : null;
const reportByFilename = new Map((contractReport?.classes || []).map((item) => [item.filename, item]));

const STANDARD_SECTION_RULES = [
  { label: "Starting point", patterns: [/STARTING\s+POINT/i] },
  { label: "Vocabulary", patterns: [/\bVOCABULARY\b/i, /VOCABULARY\s*&\s*SPEAKING/i, /VOCABULARY\s+PLUS/i] },
  { label: "Vocabulary & Speaking", patterns: [/VOCABULARY\s*&\s*SPEAKING/i] },
  { label: "Listening", patterns: [/\bLISTENING\b/i, /LISTENING\s*&\s*SPEAKING/i] },
  { label: "Listening & Speaking", patterns: [/LISTENING\s*&\s*SPEAKING/i] },
  { label: "Role Play", patterns: [/ROLE\s+PLAY/i] },
  { label: "Grammar", patterns: [/\bGRAMMAR\b/i] },
  { label: "Discussion", patterns: [/\bDISCUSSION\b/i] },
  { label: "Reading", patterns: [/\bREADING\b/i] },
  { label: "Writing", patterns: [/\bWRITING\b/i] },
  { label: "Speaking", patterns: [/\bSPEAKING\b/i] },
];

const SPECIAL_CLASS_TYPES = new Set(["grammar plus", "video class"]);

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pad2(value) {
  return String(value || "").padStart(2, "0");
}

function readFiles() {
  const root = path.resolve(knowledgePath);
  if (!fs.existsSync(root)) throw new Error(`Knowledge path does not exist: ${root}`);

  return fs
    .readdirSync(root)
    .filter((filename) => filename.endsWith(".md"))
    .filter((filename) => !unitFilter || filename.startsWith(`unit-${pad2(unitFilter)}-`))
    .sort()
    .map((filename) => ({ filename, fullPath: path.join(root, filename), text: fs.readFileSync(path.join(root, filename), "utf8") }));
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return normalizeSpace(value);
  }
  return "";
}

function allMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).map((match) => normalizeSpace(match[1] || match[0]));
}

function parsePageRange(value) {
  const normalized = normalizeSpace(value).toLowerCase();
  if (!normalized || normalized.includes("not indexed") || normalized === "none") return [];

  const range = normalized.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return Array.from({ length: max - min + 1 }, (_, index) => String(min + index));
  }

  return Array.from(new Set((normalized.match(/\d+/g) || []).map(String)));
}

function missingExpectedPages(expectedPages, detectedPages) {
  const detected = new Set(detectedPages.map(String));
  return expectedPages.filter((page) => !detected.has(String(page)));
}

function parseMetadata(text) {
  return {
    unit: Number(firstMatch(text, [/^- Unit:\s*(\d+)/im])) || 0,
    localClass: Number(firstMatch(text, [/^- Local class inside unit:\s*(\d+)/im])) || 0,
    globalClass: Number(firstMatch(text, [/^- Global English OS class:\s*(\d+)/im])) || 0,
    lessonType: firstMatch(text, [/^- Lesson type:\s*([^\n]+)/im]),
    lessonTitle: firstMatch(text, [/^Lesson title:\s*([^\n]+)/im, /^- Lesson title:\s*([^\n]+)/im, /^Lesson\s+[A-Z]:\s*([^\n]+)/im]),
    fullLessonTitle: firstMatch(text, [/^### Full lesson context[\s\S]*?^- Lesson title:\s*([^\n]+)/im]),
    bookPages: firstMatch(text, [/^- Active class book pages:\s*([^\n]+)/im, /^- Book pages:\s*([^\n]+)/im]),
    pdfPages: firstMatch(text, [/^- Active class PDF pages:\s*([^\n]+)/im, /^- PDF pages:\s*([^\n]+)/im]),
  };
}

function parseContract(text) {
  return {
    exists: /Active class teaching contract/i.test(text),
    sections: firstMatch(text, [/^- Active class section names:\s*([^\n]+)/im]),
    grammarFocus: firstMatch(text, [/^- Active class grammar focus:\s*([^\n]+)/im]),
    vocabularyFocus: firstMatch(text, [/^- Active class vocabulary focus:\s*([^\n]+)/im]),
    targetStructures: firstMatch(text, [/^- Active class target structures:\s*([^\n]+)/im]),
    expectedProduction: firstMatch(text, [/^- Expected learner production:\s*([^\n]+)/im]),
    sourceStatus: firstMatch(text, [/^- Source status:\s*([^\n]+)/im]),
    specialMode: firstMatch(text, [/^### Special class mode\s*\n([^#]+)/im, /^- Special class mode:\s*([^\n]+)/im]),
  };
}

function extractedContent(text) {
  const marker = "## Extracted Student Book content";
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(index + marker.length) : "";
}

function detectPdfPages(text) {
  return Array.from(new Set(allMatches(text, /^PDF_PAGE:\s*(\d+)/gim)));
}

function detectBookPages(text) {
  return Array.from(new Set(allMatches(text, /^BOOK_PAGE:\s*(\d+)/gim)));
}

function detectSections(sourceText) {
  const found = [];
  for (const rule of STANDARD_SECTION_RULES) {
    const indexes = rule.patterns.map((pattern) => sourceText.search(pattern)).filter((index) => index >= 0);
    if (indexes.length) found.push({ label: rule.label, index: Math.min(...indexes) });
  }
  let ordered = found.sort((a, b) => a.index - b.index).map((item) => item.label);
  if (ordered.includes("Vocabulary & Speaking")) ordered = ordered.filter((item) => item !== "Vocabulary");
  if (ordered.includes("Listening & Speaking")) ordered = ordered.filter((item) => item !== "Listening");
  if (ordered.some((item) => item.endsWith("& Speaking"))) ordered = ordered.filter((item) => item !== "Speaking");
  return Array.from(new Set(ordered));
}

function splitContractSections(sections) {
  return String(sections || "")
    .split(/\s*\+\s*/)
    .map((item) => normalizeSpace(item))
    .filter(Boolean);
}

function sectionCovered(detectedSection, contractSections) {
  const normalizedDetected = detectedSection.toLowerCase();
  return contractSections.some((section) => {
    const normalizedContract = section.toLowerCase();
    return normalizedContract === normalizedDetected || normalizedContract.includes(normalizedDetected) || normalizedDetected.includes(normalizedContract);
  });
}

function expectedFilename(meta) {
  if (!meta.unit || !meta.localClass || !meta.globalClass) return "";
  return `unit-${pad2(meta.unit)}-local-class-${pad2(meta.localClass)}-global-class-${pad2(meta.globalClass)}-class-pack-unit-${pad2(meta.unit)}-class-${pad2(meta.globalClass)}.md`;
}

function recordMissingPageFinding({ missingPages, pageType, expectedRange, allowWarning, issues, warnings }) {
  if (!missingPages.length) return;
  const message = `Missing extracted ${pageType} page marker(s): ${missingPages.join(", ")} from expected range ${expectedRange}.`;
  if (allowWarning) {
    warnings.push(`Source completeness warning: ${message}`);
  } else {
    issues.push(message);
  }
}

function recordSectionCoverageFinding(message, contract, issues, warnings) {
  if (contract.exists && contract.sections) {
    warnings.push(`Contract section coverage warning: ${message}`);
  } else {
    issues.push(message);
  }
}

function auditFile(file) {
  const meta = parseMetadata(file.text);
  const contract = parseContract(file.text);
  const source = extractedContent(file.text);
  const reportEntry = reportByFilename.get(file.filename);
  const detectedSections = reportEntry?.contract?.sections || detectSections(source);
  const contractSections = splitContractSections(contract.sections);
  const pdfPages = detectPdfPages(source);
  const bookPages = detectBookPages(source);
  const expectedPdfPages = parsePageRange(meta.pdfPages);
  const expectedBookPages = parsePageRange(meta.bookPages);
  const lessonType = meta.lessonType.toLowerCase();
  const isSpecial = SPECIAL_CLASS_TYPES.has(lessonType);
  const issues = [];
  const warnings = [];

  if (!contract.exists) issues.push("Missing Active class teaching contract.");
  if (!contract.sections) issues.push("Missing Active class section names.");
  if (!contract.grammarFocus) issues.push("Missing Active class grammar focus.");
  if (!contract.vocabularyFocus) warnings.push("Missing Active class vocabulary focus.");
  if (!contract.targetStructures) warnings.push("Missing Active class target structures.");
  if (!contract.expectedProduction) issues.push("Missing Expected learner production.");
  if (/Extract exact|Extract vocabulary|indexed page range|recycle only confirmed/i.test(JSON.stringify(contract))) {
    issues.push("Contract contains learner-unsafe placeholder instructions.");
  }
  if (/^Unit\s+\d+\s+Lesson\s+[AB](?:\s+extension)?$/i.test(meta.lessonTitle)) {
    issues.push("Lesson title is generic instead of the visible Student Book title.");
  }
  if (/^Lesson\s+[AB](?:\s+extension)?$/i.test(contract.sections) || contractSections.some((section) => /^Lesson\s+[AB]/i.test(section))) {
    issues.push("Active class sections contain a generic lesson wrapper instead of visible section names.");
  }
  if (!meta.lessonTitle && !isSpecial) warnings.push("Missing Lesson title. This can cause the model to borrow a title from another retrieved class.");
  if (!isSpecial && meta.fullLessonTitle && normalizeSpace(meta.lessonTitle).toLowerCase() !== normalizeSpace(meta.fullLessonTitle).toLowerCase()) {
    issues.push(`Active lesson title '${meta.lessonTitle}' does not match full lesson title '${meta.fullLessonTitle}'.`);
  }

  const expected = expectedFilename(meta);
  if (expected && expected !== file.filename) issues.push(`Filename mismatch. Expected ${expected} from metadata, got ${file.filename}.`);

  if (!isSpecial) {
    if (!source.trim()) issues.push("Student Book class has no extracted source text.");
    if (!pdfPages.length) issues.push("Student Book class has no PDF_PAGE markers.");
    if (!bookPages.length) issues.push("Student Book class has no BOOK_PAGE markers.");

    const missingPdf = missingExpectedPages(expectedPdfPages, pdfPages);
    const missingBook = missingExpectedPages(expectedBookPages, bookPages);
    recordMissingPageFinding({ missingPages: missingPdf, pageType: "PDF", expectedRange: meta.pdfPages, allowWarning: false, issues, warnings });
    recordMissingPageFinding({ missingPages: missingBook, pageType: "BOOK", expectedRange: meta.bookPages, allowWarning: false, issues, warnings });

    if (!detectedSections.length) warnings.push("No visible section headings detected in extracted source text.");

    for (const detectedSection of detectedSections) {
      if (!sectionCovered(detectedSection, contractSections)) {
        recordSectionCoverageFinding(`Detected section '${detectedSection}' in source, but it is missing from Active class section names.`, contract, issues, warnings);
      }
    }
    const coveredDetected = detectedSections.filter((section) => sectionCovered(section, contractSections));
    const coveredContract = contractSections.filter((section) => sectionCovered(section, detectedSections));
    if (coveredDetected.join("|").toLowerCase() !== coveredContract.join("|").toLowerCase()) {
      issues.push(`Section order mismatch. Source: ${detectedSections.join(" + ")}; contract: ${contractSections.join(" + ")}.`);
    }

    if (!reportEntry) {
      if (/\bGRAMMAR\b/i.test(source) && !sectionCovered("Grammar", contractSections)) recordSectionCoverageFinding("Source contains GRAMMAR, but contract omits Grammar.", contract, issues, warnings);
      if (/\bDISCUSSION\b/i.test(source) && !sectionCovered("Discussion", contractSections)) recordSectionCoverageFinding("Source contains DISCUSSION, but contract omits Discussion.", contract, issues, warnings);
      if (/\bLISTENING\b/i.test(source) && !contractSections.some((section) => /listening/i.test(section))) recordSectionCoverageFinding("Source contains LISTENING, but contract omits Listening.", contract, issues, warnings);
      if (/\bWRITING\b/i.test(source) && !sectionCovered("Writing", contractSections)) recordSectionCoverageFinding("Source contains WRITING, but contract omits Writing.", contract, issues, warnings);
    }
  }

  if (lessonType === "grammar plus") {
    if (!/No direct Student Book page text is indexed/i.test(source)) warnings.push("Grammar Plus has source text; verify whether it should be a Student Book class or supplemental practice.");
    if (!/Grammar Plus/i.test(contract.sections)) issues.push("Grammar Plus class must include Grammar Plus in Active class section names.");
    if (!contract.specialMode) issues.push("Grammar Plus class must include a Special class mode explaining supplemental practice.");
  }

  if (lessonType === "video class") {
    if (!/Video Class/i.test(contract.sections)) issues.push("Video Class must include Video Class in Active class section names.");
    if (!/Drive Materials/i.test(contract.specialMode || "")) issues.push("Video Class Special class mode must require Drive Materials video resource.");
  }

  return {
    filename: file.filename,
    metadata: meta,
    contract,
    detected: { pdfPages, bookPages, sections: detectedSections, expectedPdfPages, expectedBookPages },
    ok: issues.length === 0 && (!failOnWarnings || warnings.length === 0),
    issues,
    warnings,
  };
}

function printMarkdown(results) {
  const failed = results.filter((item) => item.issues.length || (failOnWarnings && item.warnings.length));
  const warnings = results.filter((item) => item.warnings.length && !item.issues.length);

  console.log(`# Passages Contract Audit${unitFilter ? ` — Unit ${unitFilter}` : ""}`);
  console.log("");
  console.log(`Files audited: ${results.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Warnings only: ${warnings.length}`);
  console.log("");

  for (const result of results) {
    const status = result.issues.length ? "FAIL" : result.warnings.length ? "WARN" : "OK";
    console.log(`## ${status} — ${result.filename}`);
    console.log(`- Lesson type: ${result.metadata.lessonType || "not found"}`);
    console.log(`- Lesson title: ${result.metadata.lessonTitle || "not found"}`);
    console.log(`- Contract sections: ${result.contract.sections || "not found"}`);
    console.log(`- Detected sections: ${result.detected.sections.join(" + ") || "none"}`);
    console.log(`- Expected book pages: ${result.detected.expectedBookPages.join(", ") || "none"}`);
    console.log(`- Book pages detected: ${result.detected.bookPages.join(", ") || "none"}`);
    console.log(`- Expected PDF pages: ${result.detected.expectedPdfPages.join(", ") || "none"}`);
    console.log(`- PDF pages detected: ${result.detected.pdfPages.join(", ") || "none"}`);

    if (result.issues.length) {
      console.log("- Issues:");
      result.issues.forEach((issue) => console.log(`  - ${issue}`));
    }
    if (result.warnings.length) {
      console.log("- Warnings:");
      result.warnings.forEach((warning) => console.log(`  - ${warning}`));
    }
    console.log("");
  }
}

try {
  const files = readFiles();
  const results = files.map(auditFile);
  const hasFailures = results.some((item) => item.issues.length || (failOnWarnings && item.warnings.length));
  if (outputJson) console.log(JSON.stringify({ ok: !hasFailures, unit: unitFilter || null, knowledgePath, results }, null, 2));
  else printMarkdown(results);
  process.exit(hasFailures ? 1 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
