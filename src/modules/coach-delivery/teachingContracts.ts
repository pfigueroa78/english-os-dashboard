import fs from "node:fs";
import path from "node:path";
import passagesUnitTitles from "../../../knowledge/passages-unit-titles.json";

export type ClassIdentity = {
  lessonTitle: string;
  bookPages: string;
  pdfPages: string;
  sections: string;
  skillFocus: string;
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
  const globalClass = (unit - 1) * 7 + localClass;
  return `unit-${pad2(unit)}-local-class-${pad2(localClass)}-global-class-${pad2(globalClass)}-class-pack-unit-${pad2(unit)}-class-${pad2(globalClass)}.md`;
}

export function loadClassPack(unit: number, localClass: number) {
  const filename = classPackFilename(unit, localClass);
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
  };
}

export function unitTitle(unit: number) {
  const units = passagesUnitTitles.units as Record<string, string>;
  return String(units[String(unit)] || "").trim();
}

export function openingSectionInstruction(sectionList: string) {
  const section = sectionList.split("+")[0]?.trim() || "Starting point";
  const normalized = section.toLowerCase();

  if (normalized === "starting point") {
    return `OPENING SECTION: ${section}. Activate the topic only. Give at most two short model reactions and ask one personal or situational question. Do not teach grammar rules, structure tables, or vocabulary lists yet.`;
  }
  if (normalized.includes("listening")) {
    return `OPENING SECTION: ${section}. Provide one short teacher-created listening input when exact audio is unavailable, then ask one gist question and at most one detail question. Do not begin later role-play, grammar, discussion, or writing sections.`;
  }
  if (normalized.includes("vocabulary")) {
    return `OPENING SECTION: ${section}. Teach at most five contract-supported chunks with two short models, then ask one compact reuse task. Do not begin later sections.`;
  }
  if (normalized.includes("grammar")) {
    return `OPENING SECTION: ${section}. Explain one target structure briefly, give two examples, and ask two controlled items. Do not begin later sections.`;
  }
  if (normalized.includes("discussion") || normalized.includes("speaking") || normalized.includes("role play")) {
    return `OPENING SECTION: ${section}. Set one realistic communication situation, give two short model turns, and ask one compact spoken or written response. Do not begin later sections.`;
  }
  if (normalized.includes("video") || normalized.includes("before watching")) {
    return `OPENING SECTION: ${section}. Do only the before-watching activation with one prediction task. Do not invent video content or begin later sections.`;
  }
  return `OPENING SECTION: ${section}. Teach only this section with two short models and one learner task. Do not begin later sections.`;
}

export function loadUnitTeachingContracts(unit: number): UnitTeachingContract[] {
  return Array.from({ length: 7 }, (_, index) => {
    const localClass = index + 1;
    const pack = loadClassPack(unit, localClass);
    return {
      localClass,
      filename: pack.filename,
      contract: activeTeachingContract(pack.content),
    };
  });
}
