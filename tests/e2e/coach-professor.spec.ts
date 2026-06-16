import { expect, test } from "@playwright/test";

async function openCoach(page: any) {
  await page.goto("/coach", { waitUntil: "domcontentloaded" });
}

async function requireUi(page: any) {
  const signIn = page.getByRole("button", { name: /sign in/i });
  if (await signIn.isVisible().catch(() => false)) test.skip(true, "Auth or demo required.");
  await expect(page.getByRole("heading", { name: /Profesor IA|Coach/i })).toBeVisible();
}

async function expectVisibleText(page: any, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible();
}

test("loads coach or sign in", async ({ page }) => {
  await openCoach(page);
  await expect(page.getByRole("button", { name: /sign in/i }).or(page.getByRole("heading", { name: /Profesor IA|Coach/i }))).toBeVisible();
});

test("shows teacher first shell", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.getByText("English OS", { exact: true }).first()).toBeVisible();
  await expectVisibleText(page, /Unidad actual/i);
  await expectVisibleText(page, /Clase de hoy/i);
  await expectVisibleText(page, /Evaluación pendiente/i);
  await expect(page.getByText(/Tokens/i)).toHaveCount(0);
  await expect(page.getByText(/Costo/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Empezar explicación/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dame una pista/i })).toBeVisible();
});

test("keeps class guidance", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.locator("article").first()).toBeVisible();
  await expectVisibleText(page, /Unidad activa:/i);
  await expectVisibleText(page, /Clase \/ lección actual:/i);
  await expectVisibleText(page, /avance se habilita solo después/i);
});

test("shows support panel", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expectVisibleText(page, /Tu clase/i);
  await expectVisibleText(page, /Guías descargables/i);
  await expectVisibleText(page, /Ayudas rápidas/i);
  await expectVisibleText(page, /Materiales de clase/i);
  await expect(page.getByRole("button", { name: /Excel gramática/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Excel vocabulario/i }).first()).toBeVisible();
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
