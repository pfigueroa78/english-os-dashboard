export type CoachFetch = typeof fetch;

export type CoachApiClient = {
  readJsonResponse: (response: Response) => Promise<any>;
  getContext: () => Promise<any>;
  getDiagnostics: () => Promise<any>;
  getDriveUnitResources: (unit: string) => Promise<any>;
  createWorkbook: (params: { kind: "grammar" | "vocabulary"; unit: string; lesson?: string }) => Promise<any>;
  sendAgentMessage: (params: { body: unknown; signal?: AbortSignal }) => Promise<any>;
  sendCoachMessage: (params: { body: unknown; signal?: AbortSignal }) => Promise<any>;
  transcribeAudio: (formData: FormData) => Promise<any>;
};

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`El servidor no devolvió contenido (${response.status || "sin estado"}). Intenta nuevamente.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`El servidor devolvió una respuesta inválida (${response.status}). Intenta nuevamente.`);
  }
}

function assertOkResponse(response: Response, data: any, fallbackMessage: string) {
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || fallbackMessage);
  }
  return data;
}

function headersWithLearnerEmail(headers: HeadersInit | undefined, learnerEmail: string) {
  const nextHeaders = new Headers(headers);
  if (learnerEmail) {
    nextHeaders.set("x-english-os-user-email", learnerEmail);
  }
  return nextHeaders;
}

export function createCoachApiClient(fetcher: CoachFetch = fetch, learnerEmail = ""): CoachApiClient {
  async function requestJson(url: string, init: RequestInit, fallbackMessage: string) {
    const response = await fetcher(url, {
      ...init,
      headers: headersWithLearnerEmail(init.headers, learnerEmail),
    });
    const data = await readJsonResponse(response);
    return assertOkResponse(response, data, fallbackMessage);
  }

  return {
    readJsonResponse,

    getContext() {
      return requestJson(
        "/api/english-os/context",
        { method: "GET", cache: "no-store" },
        "Failed to load English OS context.",
      );
    },

    getDiagnostics() {
      return fetcher("/api/english-os/diagnostics", {
        method: "GET",
        cache: "no-store",
        headers: headersWithLearnerEmail(undefined, learnerEmail),
      }).then(readJsonResponse);
    },

    getDriveUnitResources(unit: string) {
      const params = new URLSearchParams({ unit });
      return requestJson(
        `/api/english-os/drive-unit-resources?${params.toString()}`,
        { method: "GET", cache: "no-store" },
        "Failed to load unit resources.",
      );
    },

    createWorkbook(params: { kind: "grammar" | "vocabulary"; unit: string; lesson?: string }) {
      const searchParams = new URLSearchParams({ unit: params.unit, lesson: params.lesson || "" });
      const endpoint = params.kind === "grammar" ? "/api/english-os/grammar-workbook" : "/api/english-os/vocabulary-workbook";
      return requestJson(
        `${endpoint}?${searchParams.toString()}`,
        { method: "GET", cache: "no-store" },
        `Failed to create ${params.kind} workbook.`,
      );
    },

    sendAgentMessage(params: { body: unknown; signal?: AbortSignal }) {
      return requestJson(
        "/api/english-os/agents",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: params.signal,
          body: JSON.stringify(params.body),
        },
        "Specialist agent request failed.",
      );
    },

    sendCoachMessage(params: { body: unknown; signal?: AbortSignal }) {
      return requestJson(
        "/api/english-os/coach",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: params.signal,
          body: JSON.stringify(params.body),
        },
        "Coach request failed.",
      );
    },

    async transcribeAudio(formData: FormData) {
      const response = await fetcher("/api/english-os/transcribe", {
        method: "POST",
        headers: headersWithLearnerEmail(undefined, learnerEmail),
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.text) {
        throw new Error(data?.error || "Transcription failed.");
      }
      return data;
    },
  };
}
