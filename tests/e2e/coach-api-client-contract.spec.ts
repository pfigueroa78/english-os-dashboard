import { test, expect } from "@playwright/test";
import { createCoachApiClient } from "../../src/modules/coach-api/coachApiClient";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

test("coach api client centralizes English OS endpoint calls", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createCoachApiClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ ok: true, resources: [], workbook: { fileUrl: "https://sheets", exportUrl: "https://xlsx" }, reply: "ok", text: "hello" });
  });

  await client.getContext();
  await client.getDriveUnitResources("Unit 4");
  await client.createWorkbook({ kind: "grammar", unit: "Unit 4", lesson: "Time clauses" });
  await client.createWorkbook({ kind: "vocabulary", unit: "Unit 4" });
  await client.sendAgentMessage({ body: { agentId: "grammar_corrector", message: "Correct me" } });
  await client.sendCoachMessage({ body: { message: "Dame la clase" } });
  await client.transcribeAudio(new FormData());

  expect(calls.map((call) => call.url)).toEqual([
    "/api/english-os/context",
    "/api/english-os/drive-unit-resources?unit=Unit+4",
    "/api/english-os/grammar-workbook?unit=Unit+4&lesson=Time+clauses",
    "/api/english-os/vocabulary-workbook?unit=Unit+4&lesson=",
    "/api/english-os/agents",
    "/api/english-os/coach",
    "/api/english-os/transcribe",
  ]);
  expect(calls[0].init).toMatchObject({ method: "GET", cache: "no-store" });
  expect(calls[4].init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
  expect(calls[5].init?.body).toBe(JSON.stringify({ message: "Dame la clase" }));
  expect(calls[6].init?.method).toBe("POST");
});

test("coach api client turns invalid responses into user-safe errors", async () => {
  const emptyClient = createCoachApiClient(async () => new Response("", { status: 200 }));
  await expect(emptyClient.getContext()).rejects.toThrow("El servidor no devolvió contenido");

  const invalidClient = createCoachApiClient(async () => new Response("not-json", { status: 502 }));
  await expect(invalidClient.getContext()).rejects.toThrow("respuesta inválida");

  const failedClient = createCoachApiClient(async () => jsonResponse({ ok: false, error: "Missing English OS environment variables." }, { status: 500 }));
  await expect(failedClient.getDriveUnitResources("Unit 4")).rejects.toThrow("Missing English OS environment variables.");
});

test("coach page consumes the api client instead of hardcoding endpoint fetches", async () => {
  const fs = await import("node:fs/promises");
  const pageSource = await fs.readFile("src/app/coach/page.tsx", "utf8");
  const pageController = await fs.readFile("src/modules/coach-page/useCoachPageController.ts", "utf8");
  const apiClient = await fs.readFile("src/modules/coach-api/coachApiClient.ts", "utf8");

  expect(pageController).toContain("createCoachApiClient");
  expect(pageSource).not.toContain("fetch(");
  expect(pageController).not.toContain("fetch(");
  expect(pageSource).not.toContain("/api/english-os/coach");
  expect(pageSource).not.toContain("/api/english-os/agents");
  expect(pageSource).not.toContain("/api/english-os/context");
  expect(apiClient).toContain("/api/english-os/coach");
  expect(apiClient).toContain("/api/english-os/agents");
  expect(apiClient).toContain("/api/english-os/context");
});
