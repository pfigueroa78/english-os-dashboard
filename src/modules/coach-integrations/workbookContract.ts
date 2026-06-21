export type CoachWorkbookKind = "grammar" | "vocabulary";

export type CoachWorkbookContract = {
  kind: CoachWorkbookKind;
  title: string;
  fileId: string;
  fileUrl: string;
  exportUrl: string;
  unit: string;
  lesson: string;
  generatedAt: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function toCoachWorkbookContract(kind: CoachWorkbookKind, value: any): CoachWorkbookContract {
  return {
    kind,
    title: text(value?.title) || (kind === "grammar" ? "English OS Grammar Workbook" : "English OS Vocabulary Workbook"),
    fileId: text(value?.fileId),
    fileUrl: text(value?.fileUrl),
    exportUrl: text(value?.exportUrl),
    unit: text(value?.unit),
    lesson: text(value?.lesson),
    generatedAt: text(value?.generatedAt),
  };
}
