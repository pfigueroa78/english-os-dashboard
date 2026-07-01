import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx|js|jsx|md|json|css)$/.test(entry.name) ? [fullPath] : [];
  });
}

test("architecture:no-personal-data-in-source", async () => {
  const forbidden = [
    /\bPedro\b/i,
    /\bpfigueroa\b/i,
    /\bpfigueroamiranda\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  ];

  for (const file of sourceFiles(sourceRoot)) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      expect(text, `${path.relative(root, file)} contains personal data matching ${pattern}`).not.toMatch(pattern);
    }
  }
});
