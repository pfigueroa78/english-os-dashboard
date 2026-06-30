import fs from "node:fs";
import path from "node:path";
import passagesUnitTitles from "../../../knowledge/passages-unit-titles.json";
import { courseStructureRepository } from "@/modules/coach-config/pedagogyConfig";
import { openingLearningBlockInstruction } from "@/modules/coach-delivery/pedagogicalDeliveryPolicy";

export type ClassIdentity = {
  lessonTitle: string;
  bookPages: string;
  pdfPages: string;
  sections: string;
  skillFocus: string;
  grammarFocus: string;
  vocabularyFocus: string;
  functions: string;
  targetStructures: string;
  expectedProduction: string;
};

export type UnitTeachingContract = {
  localClass: number;
  filename: string;
  contract: string;
};

export function pad2(value: number | string) {
  return String(value).padStart(2, "0");
}

export function classPackFilename(unit: number, localClass: number) {
  const globalClass = courseStructureRepository().currentClass(unit, localClass)?.globalClass;
  if (!globalClass) return "";
  return `unit-${pad2(unit)}-local-class-${pad2(localClass)}-global-class-${pad2(globalClass)}-class-pack-unit-${pad2(unit)}-class-${pad2(globalClass)}.md`;
}

export function loadClassPack(unit: number, localClass: number) {
  const filename = classPackFilename(unit, localClass);
  if (!filename) return { filename: "", content: "" };
  const fullPath = path.join(process.cwd(), "knowledge", "class-packs-lesson-vision", filename);
  if (!fs.existsSync(fullPath)) return { filename, content: "" };
  return { filename, content: fs.readFileSync(fullPath, "utf8") };
}

export function activeTeachingContract(content: string) {
  const heading = "### Active class teaching contract";
  const start = content.indexOf(heading);
  if (start < 0) return "";
  const safetyRule = content.indexOf("### Safety rule", start);
  const extractedContent = content.indexOf("## Extracted Student Book content", start);
  const candidates = [safetyRule, extractedContent].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : content.length;
  return content.slice(start, end).trim();
}

export function contractField(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.match(new RegExp(`^- ${escaped}:\\s*([^\\n]+)`, "im"))?.[1]?.trim() || "";
}

export function classIdentity(content: string): ClassIdentity {
  const contract = activeTeachingContract(content);
  return {
    lessonTitle: contractField(contract, "Lesson title"),
    bookPages: contractField(contract, "Active class book pages"),
    pdfPages: contractField(contract, "Active class PDF pages"),
    sections: contractField(contract, "Active class section names"),
    skillFocus: contractField(contract, "Active class skill focus"),
    grammarFocus: contractField(contract, "Active class grammar focus"),
    vocabularyFocus: contractField(contract, "Active class vocabulary focus"),
    functions: contractField(contract, "Active class functions"),
    targetStructures: contractField(contract, "Active class target structures"),
    expectedProduction: contractField(contract, "Expected learner production"),
  };
}

export function unitTitle(unit: number) {
  const units = passagesUnitTitles.units as Record<string, string>;
  return String(units[String(unit)] || "").trim();
}

export function openingSectionInstruction(sectionList: string) {
  return openingLearningBlockInstruction({
    lessonTitle: "",
    bookPages: "",
    pdfPages: "",
    sections: sectionList,
    skillFocus: "",
    grammarFocus: "",
    vocabularyFocus: "",
    functions: "",
    targetStructures: "",
    expectedProduction: "",
  });
}

export function loadUnitTeachingContracts(unit: number): UnitTeachingContract[] {
  return courseStructureRepository().allClasses().filter((item) => item.unit === unit).map(({ localClass }) => {
    const pack = loadClassPack(unit, localClass);
    return {
      localClass,
      filename: pack.filename,
      contract: activeTeachingContract(pack.content),
    };
  });
}
