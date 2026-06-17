#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_CONTRACT_AUDIT_MODEL || process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const EVIDENCE_PATH = process.argv[2] || "knowledge/passages-pdf-evidence.json";
const PACK_DIR = "knowledge/class-packs-lesson-vision";
const REPORT_PATH = "knowledge/passages-contract-audit.json";
const START = "<!-- PASSAGES_ACTIVE_CONTRACT_START -->";
const END = "<!-- PASSAGES_ACTIVE_CONTRACT_END -->";
const FORBIDDEN = [/Extract exact/i, /Extract vocabulary/i, /indexed page range/i, /Lesson [AB] extension/i];
const ALLOWED_SECTIONS = new Set(["Starting point", "Vocabulary", "Vocabulary & Speaking", "Listening", "Listening & Speaking", "Role Play", "Grammar", "Discussion", "Reading", "Writing", "Speaking"]);
const SECTION_CANONICAL = new Map([...ALLOWED_SECTIONS].map((value) => [value.toLowerCase().replace(/\band\b/g, "&"), value]));

function imageDataUrl(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function outputText(data) {
  return data.output_text || data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || "";
}

function parseJson(text) {
  const value = String(text || "").replace(/^```json/i, "").replace(/```$/i, "").trim();
  return JSON.parse(value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function list(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function validateContract(contract, evidence) {
  const required = ["lessonTitle", "skillFocus", "grammarFocus", "vocabularyFocus", "functions", "targetStructures", "expectedLearnerProduction"];
  for (const key of required) if (!contract[key] || (Array.isArray(contract[key]) && !contract[key].length)) throw new Error(`${evidence.filename}: missing ${key}`);
  const sections = Array.from(new Set(list(contract.sections).map((section) => SECTION_CANONICAL.get(section.toLowerCase().replace(/\band\b/g, "&")) || section)));
  if (!sections.length) throw new Error(`${evidence.filename}: missing sections`);
  const invalid = sections.filter((section) => !ALLOWED_SECTIONS.has(section));
  if (invalid.length) throw new Error(`${evidence.filename}: non-standard section heading(s): ${invalid.join(", ")}`);
  let cursor = -1;
  for (const detected of evidence.detectedSections) {
    const index = sections.findIndex((section, candidateIndex) =>
      candidateIndex >= cursor && (section === detected || section.startsWith(`${detected} &`) || (detected === "Speaking" && section.endsWith("& Speaking")))
    );
    if (index < 0 || index < cursor) {
      throw new Error(`${evidence.filename}: visual sections '${sections.join(" + ")}' do not preserve detected PDF section '${detected}' in order`);
    }
    cursor = index;
  }
  const serialized = JSON.stringify(contract);
  const marker = FORBIDDEN.find((pattern) => pattern.test(serialized));
  if (marker) throw new Error(`${evidence.filename}: forbidden generic marker ${marker}`);
  return { ...contract, sections };
}

async function analyzeUnit(unit, classes) {
  const prompt = `You are auditing Passages Third Edition Level 1 class contracts against exact PDF page text.
Return one JSON object only: {"classes":[...]}. Return one entry per supplied class.
For each entry use: filename, lessonTitle, sections, skillFocus, grammarFocus, vocabularyFocus, functions, targetStructures, expectedLearnerProduction, evidenceNotes.
Rules:
- sections must copy the visible standard section headings from the supplied page images in their visual order; never add generic wrappers or labels such as Language.
- detectedSections is an OCR hint that can omit graphic headings, but every detected section must remain present in order.
- lessonTitle must be the real visible lesson title, not "Unit X Lesson A" or "extension".
- grammarFocus must name visible grammar when Grammar is active; otherwise explicitly say the class is not grammar-centered and name its real skill focus.
- vocabularyFocus, functions, and targetStructures must be arrays of concise, confirmed items from the supplied page text.
- every schema field must be present and non-empty; when there is no Vocabulary section, vocabularyFocus must still list confirmed chunks from the active listening, grammar, speaking, reading, or writing activities.
- expectedLearnerProduction must cover every active section.
- do not invent audio transcripts, answer keys, wording, sections, or resources.
- distinguish Writing/Reading/Listening/Role Play from grammar.

EVIDENCE:
${JSON.stringify({ unit, classes: classes.map((item) => ({ ...item, pages: item.pages.map(({ image, ...page }) => page) })) })}`;
  const images = classes.flatMap((item) => item.pages.map((page) => ({ pdfPage: page.pdfPage, image: page.image })))
    .filter((item, index, values) => values.findIndex((candidate) => candidate.pdfPage === item.pdfPage) === index)
    .sort((a, b) => a.pdfPage - b.pdfPage);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...images.flatMap((item) => [
            { type: "input_text", text: `Visible PDF page ${item.pdfPage}:` },
            { type: "input_image", image_url: imageDataUrl(item.image), detail: "high" },
          ]),
        ],
      }],
      text: { format: { type: "json_object" } },
      max_output_tokens: 12000,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed for unit ${unit}`);
  return parseJson(outputText(data)).classes || [];
}

function renderBlock(evidence, contract) {
  return `${START}
### Active class teaching contract
- Active class: Unit ${evidence.unit}, local class ${evidence.localClass}, global class ${evidence.globalClass}
- Lesson title: ${clean(contract.lessonTitle)}
- Active class book pages: ${evidence.bookPages}
- Active class PDF pages: ${evidence.pdfPages}
- Active class section names: ${contract.sections.join(" + ")}
- Active class skill focus: ${clean(contract.skillFocus)}
- Active class grammar focus: ${clean(contract.grammarFocus)}
- Active class vocabulary focus: ${list(contract.vocabularyFocus).join("; ")}
- Active class functions: ${list(contract.functions).join("; ")}
- Active class target structures: ${list(contract.targetStructures).join("; ")}
- Expected learner production: ${clean(contract.expectedLearnerProduction)}
- Source status: Verified against visible Student Book pages ${evidence.bookPages} / PDF pages ${evidence.pdfPages}.

### Safety rule
Preserve the verified sections, sequence, focus, and target language. Do not fabricate answer keys, audio transcripts, exercises, or source wording.
${END}`;
}

function replaceContract(text, block) {
  const passages = new RegExp(`${START}[\\s\\S]*?${END}`, "m");
  if (passages.test(text)) return text.replace(passages, block);
  const visionContract = /### Active class teaching contract[\s\S]*?(?=### Full lesson context)/m;
  if (visionContract.test(text)) return text.replace(visionContract, `${block}\n\n`);
  const anchor = "Teacher instruction: Use this file as the primary source for this exact class. Do not substitute content from another class.";
  if (text.includes(anchor)) return text.replace(anchor, `${anchor}\n\n${block}`);
  throw new Error("Unable to locate contract insertion point");
}

async function main() {
  if (!API_KEY) throw new Error("Missing OPENAI_API_KEY.");
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  if (evidence.studentBookClasses !== 48) throw new Error(`Expected 48 Student Book classes, found ${evidence.studentBookClasses}`);
  const byUnit = new Map();
  for (const item of evidence.classes) {
    if (!byUnit.has(item.unit)) byUnit.set(item.unit, []);
    byUnit.get(item.unit).push(item);
  }

  const report = [];
  for (const [unit, classes] of [...byUnit.entries()].sort((a, b) => a[0] - b[0])) {
    let verified = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3 && !verified; attempt += 1) {
      try {
        const generated = await analyzeUnit(unit, classes);
        for (const item of classes) {
          if (!generated.some((entry) => entry.filename === item.filename)) {
            const single = await analyzeUnit(unit, [item]);
            generated.push(...single);
          }
        }
        if (generated.length !== classes.length) throw new Error(`expected ${classes.length} contracts, got ${generated.length}`);
        verified = classes.map((item) => {
          const raw = generated.find((entry) => entry.filename === item.filename);
          if (!raw) throw new Error(`${item.filename}: model omitted class`);
          return { item, contract: validateContract(raw, item) };
        });
      } catch (error) {
        lastError = error;
        console.warn(`Unit ${unit}, attempt ${attempt}: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (!verified) throw lastError || new Error(`Unit ${unit}: validation failed`);
    for (const { item, contract } of verified) {
      const packPath = path.join(PACK_DIR, item.filename);
      const before = fs.readFileSync(packPath, "utf8");
      fs.writeFileSync(packPath, replaceContract(before, renderBlock(item, contract)), "utf8");
      report.push({ ...item, contract, changed: true });
    }
    console.log(`Unit ${unit}: ${classes.length} contracts verified and written.`);
  }
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({ schemaVersion: 1, model: MODEL, sourcePdf: evidence.sourcePdf, classes: report }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, model: MODEL, classes: report.length, report: REPORT_PATH }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
