import type { CoachApiClient } from "@/modules/coach-api/coachApiClient";
import { toCoachWorkbookContract, type CoachWorkbookContract, type CoachWorkbookKind } from "@/modules/coach-integrations/workbookContract";

export type CoachWorkbookRequest = {
  api: Pick<CoachApiClient, "createWorkbook">;
  kind: CoachWorkbookKind;
  unit: string;
  studyMode: "current" | "class" | "review" | "guide" | "conversation" | "fallback";
  currentLesson: string;
};

export type CoachWorkbookResult = {
  workbook: CoachWorkbookContract;
  openUrl: string;
  coachMessage: {
    role: "coach";
    content: string;
  };
};

function unitDisplayName(unit: string) {
  return unit.trim() || "la unidad actual";
}

function guideName(kind: CoachWorkbookKind) {
  return kind === "grammar" ? "gramática" : "vocabulario";
}

function lessonForWorkbook(params: CoachWorkbookRequest) {
  return params.studyMode === "current" ? params.currentLesson : "";
}

export async function createCoachWorkbook(params: CoachWorkbookRequest): Promise<CoachWorkbookResult | null> {
  if (!params.unit.trim()) return null;

  const data = await params.api.createWorkbook({
    kind: params.kind,
    unit: params.unit,
    lesson: lessonForWorkbook(params),
  });

  const workbook = toCoachWorkbookContract(params.kind, data.workbook);
  const openUrl = workbook.exportUrl || workbook.fileUrl;
  if (!openUrl) {
    throw new Error(`Invalid ${params.kind} workbook contract.`);
  }

  return {
    workbook,
    openUrl,
    coachMessage: {
      role: "coach",
      content: [
        `Listo. Generé la guía de ${guideName(params.kind)} para ${unitDisplayName(params.unit)}.`,
        "",
        workbook.exportUrl ? `- [Descargar XLSX](${workbook.exportUrl})` : "",
        workbook.fileUrl ? `- [Abrir en Sheets](${workbook.fileUrl})` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  };
}
