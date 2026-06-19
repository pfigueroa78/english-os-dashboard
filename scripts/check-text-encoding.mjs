import fs from "node:fs";
import path from "node:path";

const roots = ["src", "knowledge/class-packs-lesson-vision", "tests", "scripts"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css"]);
const ignoredDirectories = new Set([".git", ".next", "node_modules", "tmp", "test-results", "playwright-report"]);

const fromCodePoints = (...points) => String.fromCodePoint(...points);
const forbiddenSequences = [
  fromCodePoints(0x00e2, 0x20ac, 0x201d),
  fromCodePoints(0x00e2, 0x20ac, 0x0153),
  fromCodePoints(0x00e2, 0x20ac, 0x2122),
  fromCodePoints(0x00c2, 0x00b7),
  fromCodePoints(0x00c2, 0x00a0),
  ...[0x00a1, 0x00a9, 0x00ad, 0x00b3, 0x00ba, 0x00bc, 0x00bf].map((second) => fromCodePoints(0x00c3, second)),
  String.fromCodePoint(0xfffd),
];

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(target);
    return extensions.has(path.extname(entry.name).toLowerCase()) ? [target] : [];
  });
}

const failures = [];
for (const file of roots.flatMap(filesUnder)) {
  const text = fs.readFileSync(file, "utf8");
  for (const sequence of forbiddenSequences) {
    const index = text.indexOf(sequence);
    if (index < 0) continue;
    const line = text.slice(0, index).split("\n").length;
    failures.push(`${file}:${line}`);
    break;
  }
}

if (failures.length) {
  console.error("Encoding check failed. Possible UTF-8 mojibake or replacement characters found:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Encoding check passed: no known mojibake sequences found.");
