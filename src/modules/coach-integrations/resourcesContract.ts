export type CoachDriveResourceType = "audio" | "video" | "document" | "link";

export type CoachDriveResourceContract = {
  id: string;
  title: string;
  description: string;
  type: CoachDriveResourceType;
  unitNumber: number | null;
  unitCode: string;
  section: string;
  page: string;
  exercise: string;
  exercisePart: string;
  url: string;
  embedUrl: string;
  provider: string;
  order: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown) {
  const match = text(value).match(/\d{1,2}/);
  return match?.[0] ? Number(match[0]) : null;
}

function resourceType(value: unknown): CoachDriveResourceType {
  const normalized = text(value).toLowerCase();
  if (normalized === "audio" || normalized === "video" || normalized === "document" || normalized === "link") return normalized;
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.includes("document") || normalized.includes("pdf") || normalized.includes("spreadsheet")) return "document";
  return "link";
}

export function toCoachDriveResourceContract(value: any): CoachDriveResourceContract {
  const id = text(value?.resourceId || value?.id || value?.fileId || value?.url || value?.title);
  const type = resourceType(value?.type || value?.mimeType);
  return {
    id,
    title: text(value?.title) || "Untitled resource",
    description: text(value?.description),
    type,
    unitNumber: numberOrNull(value?.unitNumber || value?.unit),
    unitCode: text(value?.unitCode),
    section: text(value?.section),
    page: text(value?.page),
    exercise: text(value?.exercise),
    exercisePart: text(value?.exercisePart),
    url: text(value?.url || value?.fileUrl || value?.webViewLink),
    embedUrl: text(value?.embedUrl),
    provider: text(value?.provider),
    order: Number(value?.order ?? 0) || 0,
  };
}

export function toCoachDriveResourcesContract(values: unknown): CoachDriveResourceContract[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(toCoachDriveResourceContract)
    .filter((resource) => Boolean(resource.id && resource.url))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
