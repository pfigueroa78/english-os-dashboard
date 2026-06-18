import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function openCoach(page: any) {
  await page.goto("/coach", { waitUntil: "domcontentloaded" });
}

async function requireUi(page: any) {
  const signIn = page.getByRole("button", { name: /sign in/i });
  if (await signIn.isVisible().catch(() => false)) test.skip(true, "Auth or demo required.");
  await expect(page.getByText(/Tu clase/i).first()).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
}

async function expectVisibleText(page: any, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible();
}

test("loads coach or sign in", async ({ page }) => {
  await openCoach(page);
  await expect(page.getByRole("button", { name: /sign in/i }).or(page.getByText(/Tu clase/i).first())).toBeVisible();
});

test("shows simplified two-column shell", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.locator("header")).toBeHidden();
  await expectVisibleText(page, /Tu clase/i);
  await expectVisibleText(page, /Guías de estudio/i);
  await expectVisibleText(page, /Ayudas rápidas/i);
  await expectVisibleText(page, /Materiales de clase/i);
  await expect(page.getByText(/Tokens/i)).toHaveCount(0);
  await expect(page.getByText(/Costo/i)).toHaveCount(0);
});

test("keeps class guidance in the chat", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expectVisibleText(page, /Unidad activa:/i);
  await expectVisibleText(page, /Clase \/ lección actual:/i);
  await expectVisibleText(page, /avance se habilita solo después/i);
});

test("places controls on the left and chat on the right on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openCoach(page);
  await requireUi(page);

  const leftPanel = page.getByText(/Tu clase/i).first();
  const chat = page.locator("article").first();
  const leftBox = await leftPanel.boundingBox();
  const chatBox = await chat.boundingBox();

  expect(leftBox).not.toBeNull();
  expect(chatBox).not.toBeNull();
  expect(leftBox!.x).toBeLessThan(chatBox!.x);
});

test("can type answer", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expectVisibleText(page, /Responde en inglés/i);
  const input = page.getByPlaceholder(/Escribe tu respuesta en inglés/i);
  await expect(input).toBeEditable();
  await page.waitForTimeout(250);
  await input.fill("The way I see it, you ought to improve communication first.");
  await expect(input).toHaveValue(/ought to improve communication/);
  await expect(page.getByRole("button", { name: /Enviar respuesta/i })).toBeEnabled();
});

test("keeps coach lesson readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCoach(page);
  await requireUi(page);

  const chatPanel = page.locator("main > div > div.grid > section").first();
  const lessonText = page.locator("article .prose p").first();

  await expect(chatPanel).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(lessonText).toHaveCSS("color", "rgb(15, 23, 42)");
  await expect(lessonText).toBeVisible();

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);
});

test("resource players are width-contained and load on demand", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("src/app/coach/page.tsx", "utf8"));

  expect(source).toContain('data-testid="resource-card"');
  expect(source).toContain("Cargar reproductor");
  expect(source).toContain("expandedResourceId === resource.resourceId");
  expect(source).toContain("min-w-0 max-w-full overflow-hidden");
  expect(source).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
  expect(source).toContain('loading="lazy"');
});

test("captures the verified coach UI", async ({ page }, testInfo) => {
  await openCoach(page);
  await requireUi(page);

  await mkdir("artifacts/ui", { recursive: true });
  await page.screenshot({
    path: `artifacts/ui/coach-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("MCP endpoint smoke", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/api/mcp`);
  expect([200, 401, 403]).toContain(response.status());
});
