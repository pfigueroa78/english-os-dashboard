import { expect, test } from "@playwright/test";

async function openCoach(page: any) {
  await page.goto("/coach", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function requireUi(page: any) {
  const signIn = page.getByRole("button", { name: /sign in/i });
  if (await signIn.isVisible().catch(() => false)) test.skip(true, "Auth or demo required.");
  await expect(page.getByRole("heading", { name: /Profesor IA|Coach/i })).toBeVisible();
}

test("loads coach or sign in", async ({ page }) => {
  await openCoach(page);
  await expect(page.getByRole("button", { name: /sign in/i }).or(page.getByRole("heading", { name: /Profesor IA|Coach/i }))).toBeVisible();
});

test("shows teacher first shell", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.getByText("English OS", { exact: true })).toBeVisible();
  await expect(page.getByText(/Unidad actual/i)).toBeVisible();
  await expect(page.getByText(/Clase de hoy/i)).toBeVisible();
  await expect(page.getByText(/Evaluación pendiente/i)).toBeVisible();
  await expect(page.getByText(/Tokens/i)).toHaveCount(0);
  await expect(page.getByText(/Costo/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Empezar explicación/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dame una pista/i })).toBeVisible();
});

test("keeps class guidance", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.getByText(/profesor de English OS/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Unidad activa:/i)).toBeVisible();
  await expect(page.getByText(/Clase \/ lección actual:/i)).toBeVisible();
  await expect(page.getByText(/avance se habilita solo después/i)).toBeVisible();
});

test("shows support panel", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.getByText(/Tu clase/i)).toBeVisible();
  await expect(page.getByText(/Guías descargables/i)).toBeVisible();
  await expect(page.getByText(/Ayudas rápidas/i)).toBeVisible();
  await expect(page.getByText(/Materiales de clase/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Excel gramática/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Excel vocabulario/i })).toBeVisible();
});

test("can type answer", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  const input = page.getByPlaceholder(/Escribe tu respuesta en inglés/i);
  await input.fill("The way I see it, you ought to improve communication first.");
  await expect(input).toHaveValue(/ought to improve communication/);
  await expect(page.getByRole("button", { name: /Enviar respuesta/i })).toBeEnabled();
});

test("MCP endpoint smoke", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/api/mcp`);
  expect([200, 401, 403]).toContain(response.status());
});
