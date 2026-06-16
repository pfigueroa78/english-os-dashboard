import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type ClassPackSummary = {
  ok: boolean;
  unit: number;
  localClass: number;
  globalClass: number;
  title: string;
  retrievalKey: string;
  lessonType: string;
  bookPages: string;
  pdfPages: string;
  sectionNames: string[];
  grammarFocus: string;
  vocabularyFocus: string;
  functions: string;
  targetStructures: string;
  expectedProduction: string;
  sourceStatus: string;
  specialMode: string;
  studentBookContent: string;
  fullMarkdown: string;
  message?: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getPackPath(unit: number, localClass: number, globalClass: number) {
  return join(
    process.cwd(),
    "knowledge",
    "class-packs-lesson-vision",
    `unit-${pad(unit)}-local-class-${pad(localClass)}-global-class-${globalClass}-class-pack-unit-${pad(unit)}-class-${globalClass}.md`
  );
}

function extractLine(markdown: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`- ${escaped}:\\s*(.+)`, "i"));
  return match?.[1]?.trim() || "";
}

function extractSection(markdown: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`### ${escaped}\\n([\\s\\S]*?)(\\n---|\\n# |\\n### |$)`, "i");
  const match = markdown.match(regex);
  return match?.[1]?.trim() || "";
}

function extractStudentBookContent(markdown: string) {
  const match = markdown.match(/## Extracted Student Book content\s*\n([\s\S]*)$/i);
  return (match?.[1] || "").trim();
}

export function loadClassPack(unit: number, localClass: number, globalClass: number): ClassPackSummary {
  const path = getPackPath(unit, localClass, globalClass);
  const retrievalKey = `CLASS_PACK_UNIT_${pad(unit)}_CLASS_${globalClass}`;

  if (!existsSync(path)) {
    return {
      ok: false,
      unit,
      localClass,
      globalClass,
      title: `Unit ${unit} — Class ${globalClass}`,
      retrievalKey,
      lessonType: "Unknown",
      bookPages: "not indexed",
      pdfPages: "not indexed",
      sectionNames: [],
      grammarFocus: "",
      vocabularyFocus: "",
      functions: "",
      targetStructures: "",
      expectedProduction: "",
      sourceStatus: "Class pack file was not found.",
      specialMode: "",
      studentBookContent: "",
      fullMarkdown: "",
      message: `No class pack found at ${path}`,
    };
  }

  const markdown = readFileSync(path, "utf8");
  const lessonType = extractLine(markdown, "Lesson type") || (markdown.includes("This is a Video Class") ? "Video Class" : "Student Book class");
  const sectionNames = extractLine(markdown, "Active class section names")
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    ok: true,
    unit,
    localClass,
    globalClass,
    title: `Unit ${unit} — Class ${globalClass}`,
    retrievalKey,
    lessonType,
    bookPages: extractLine(markdown, "Book pages") || extractLine(markdown, "Active class book pages") || "not indexed",
    pdfPages: extractLine(markdown, "PDF pages") || extractLine(markdown, "Active class PDF pages") || "not indexed",
    sectionNames,
    grammarFocus: extractLine(markdown, "Active class grammar focus"),
    vocabularyFocus: extractLine(markdown, "Active class vocabulary focus"),
    functions: extractLine(markdown, "Active class functions"),
    targetStructures: extractLine(markdown, "Active class target structures"),
    expectedProduction: extractLine(markdown, "Expected learner production"),
    sourceStatus: extractLine(markdown, "Source status"),
    specialMode: extractSection(markdown, "Special class mode"),
    studentBookContent: extractStudentBookContent(markdown),
    fullMarkdown: markdown,
  };
}

export function loadUnitClassPacks(unit: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const localClass = index + 1;
    const globalClass = (unit - 1) * 7 + localClass;
    return loadClassPack(unit, localClass, globalClass);
  });
}
