import type { CoachApiClient } from "@/modules/coach-api/coachApiClient";

export type CoachResource = {
  id: string;
  title: string;
  description: string;
  type: "audio" | "video" | "document" | "link";
  unitNumber: number | null;
  unitCode: string;
  section?: string;
  page?: string;
  exercise?: string;
  exercisePart?: string;
  url: string;
  embedUrl: string;
  provider: string;
  order?: number;
};

export type LoadCoachResourcesResult = {
  resources: CoachResource[];
  notice: string;
  error: string;
};

const missingEnvironmentMessage =
  "Los materiales conectados no estan configurados en este entorno local. Para cargarlos aqui hacen falta ENGLISH_OS_BASE_URL y ENGLISH_OS_TOKEN en .env.local.";

export async function loadCoachResources(params: {
  api: Pick<CoachApiClient, "getDriveUnitResources">;
  unit: string;
}): Promise<LoadCoachResourcesResult> {
  try {
    const data = await params.api.getDriveUnitResources(params.unit);
    return {
      resources: Array.isArray(data.resources) ? data.resources : [],
      notice: typeof data.notice === "string" ? data.notice : "",
      error: "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown resources error";
    if (/Missing English OS environment variables/i.test(message)) {
      return {
        resources: [],
        notice: missingEnvironmentMessage,
        error: "",
      };
    }
    return {
      resources: [],
      notice: "",
      error: message,
    };
  }
}
