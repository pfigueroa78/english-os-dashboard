import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function openCoach(page: any) {
  await page.goto("/coach", { waitUntil: "domcontentloaded" });
}

async function requireUi(page: any) {
  const signIn = page.getByRole("button", { name: /sign in/i });
  await expect(signIn.or(page.getByText(/Objetivo activo/i).first())).toBeVisible();
  if (await signIn.isVisible().catch(() => false)) test.skip(true, "Auth or demo required.");
  const showPanel = page.getByRole("button", { name: /Mostrar panel/i });
  if (await showPanel.isVisible().catch(() => false)) await showPanel.click();
  await expect(page.getByText(/Objetivo activo/i).first()).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
}

async function expectVisibleText(page: any, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible();
}

test("loads coach or sign in", async ({ page }) => {
  await openCoach(page);
  await expect(page.getByRole("button", { name: /sign in/i }).or(page.getByText(/Objetivo activo/i).first())).toBeVisible();
});

test("shows simplified two-column shell", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.locator("header")).toBeHidden();
  await expectVisibleText(page, /Objetivo activo/i);
  await expect(page.locator(".coach-status-brand")).toHaveText("English OS");
  await expect(page.locator(".coach-status")).toContainText(/Actual|Clase|Repaso|Guía/);
  await expectVisibleText(page, /Posición guardada:/i);
  await expectVisibleText(page, /Guías de estudio/i);
  await expectVisibleText(page, /Ayudas rápidas/i);
  await expectVisibleText(page, /Materiales de clase/i);
  await expect(page.getByText(/Tokens/i)).toHaveCount(0);
  await expect(page.getByText(/Costo/i)).toHaveCount(0);
});

test("keeps class guidance in the chat", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);
  await expect(page.getByPlaceholder(/Escribe tu respuesta en inglés/i)).toBeVisible();
  await expect(page.getByText(/Responde en inglés/i)).toHaveCount(0);
  await expect(page.getByText(/Enter envía/i)).toHaveCount(0);
});

test("places controls on the left and chat on the right on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openCoach(page);
  await requireUi(page);

  const leftPanel = page.getByText(/Objetivo activo/i).first();
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
  const input = page.getByPlaceholder(/Escribe tu respuesta en inglés/i);
  await expect(input).toBeEditable();
  await page.waitForTimeout(250);
  await input.fill("The way I see it, you ought to improve communication first.");
  await expect(input).toHaveValue(/ought to improve communication/);
  await expect(page.getByRole("button", { name: /Enviar respuesta/i })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Dictar con micrófono/i })).toBeEnabled();
  await expect(page.getByText(/Copy response/i)).toHaveCount(0);
});

test("renders user messages as one compact inline line", async ({ page }) => {
  await openCoach(page);
  await requireUi(page);

  const input = page.getByPlaceholder(/Escribe tu respuesta en inglés/i);
  await input.fill("Hola, podemos ver la clase 1 de la unidad 5?");
  await page.getByRole("button", { name: /Enviar respuesta/i }).click();

  const userMessage = page.locator(".coach-message-user").last();
  const label = userMessage.locator(".coach-user-message-label");
  const content = userMessage.locator(".prose p").first();
  await expect(label).toHaveText(/Tú —/);
  await expect(content).toContainText("Hola, podemos ver la clase 1 de la unidad 5?");

  const labelBox = await label.boundingBox();
  const contentBox = await content.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(Math.abs(labelBox!.y - contentBox!.y)).toBeLessThan(6);
  expect(contentBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width);
});

test("keeps coach lesson readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCoach(page);
  await requireUi(page);

  const chatPanel = page.locator(".coach-chat").first();
  const lessonText = page.locator("article .prose p").first();

  await expect(chatPanel).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(lessonText).toHaveCSS("color", "rgb(15, 23, 42)");
  await expect(lessonText).toBeVisible();

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);
});

test("changes themes and collapses the complete left panel", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openCoach(page);
  await requireUi(page);

  await page.getByLabel(/Tema/i).selectOption("sage");
  await expect(page.locator(".coach-shell")).toHaveAttribute("data-theme", "sage");

  await expect(page.getByRole("button", { name: /Disminuir tamaño de texto/i })).toBeVisible();
  await page.getByRole("button", { name: /Aumentar tamaño de texto/i }).click();
  await expect(page.locator(".coach-shell")).toHaveAttribute("data-text-size", "normal");

  await page.getByRole("button", { name: /Ocultar panel/i }).click();
  await expect(page.locator("#coach-sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mostrar panel/i })).toBeVisible();
});

test("landing page opens and routes to the coach", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("English OS").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Una clase de inglés/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continuar mi clase/i })).toHaveAttribute("href", "/coach");
  await expect(page.getByRole("link", { name: /Abrir coach/i })).toBeVisible();
  await expect(page.getByText(/Passages/i)).toHaveCount(0);
});

test("resource players are width-contained and load on demand", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("src/app/coach/page.tsx", "utf8");
  const styles = await fs.readFile("src/app/globals.css", "utf8");

  expect(source).toContain('data-testid="resource-card"');
  expect(source).toContain("resourcesNotice");
  expect(source).toContain("Los materiales conectados no están configurados");
  expect(source).toContain("Descargar XLSX");
  expect(source).toContain("Abrir en Sheets");
  expect(source).toContain("coach-workbook-card");
  expect(styles).toContain(".coach-message-user .coach-message-actions { display: none; }");
  expect(styles).toContain(".coach-message-teacher { padding-right: 0; }");
  expect(styles).toContain(".coach-message-teacher .prose::before");
  expect(styles).toContain("float: right;");
  expect(styles).toContain("width: 10.9rem;");
  expect(styles).toContain(".coach-user-message-line");
  expect(styles).toContain(".coach-user-message-label");
  expect(source).toContain("coach-user-message-line");
  expect(source).toContain("Tú —");
  expect(styles).toContain(".coach-message-user .coach-message-label p::after");
  expect(styles).toContain('.coach-message-user .coach-message-label p { display: inline; margin: 0; }');
  expect(styles).toContain('.coach-message-user .prose p { display: inline; margin: 0; }');
  expect(styles).toContain("background: #fff;");
  expect(styles).toContain(".coach-textarea::placeholder");
  expect(styles).toContain("min-height: 2.18rem;");
  expect(styles).toContain("height: 2.25rem;");
  expect(styles).toContain("--coach-message-font-size");
  expect(styles).toContain('--coach-message-line-height: 1.28;');
  expect(styles).toContain('.coach-shell[data-text-size="compact"]');
  expect(styles).toContain(".coach-font-controls");
  expect(styles).toContain(".coach-font-button");
  expect(styles).toContain("@keyframes coach-thinking-dot");
  expect(styles).toContain(".coach-thinking-dots");
  expect(styles).toContain(".coach-thinking-stop");
  expect(source).toContain('type CoachTheme = "slate" | "paper" | "sage" | "sand" | "blue"');
  expect(source).toContain('type CoachTextSize = "compact" | "normal" | "large"');
  expect(source).toContain("english-os-coach-text-size");
  expect(source).toContain("data-text-size={textSize}");
  expect(source).toContain("Disminuir tamaño de texto");
  expect(source).toContain("Aumentar tamaño de texto");
  expect(source).toContain("studyModeLabel");
  expect(source).toContain("coach-status-brand");
  expect(source).toContain("EnglishOsLogo");
  expect(styles).toContain(".coach-status-logo");
  expect(source).toContain("coach-panel-toggle");
  expect(source).toContain("textareaRef");
  expect(source).toContain("rows={1}");
  expect(source).toContain("coach-shell h-[100dvh] max-w-full overflow-hidden");
  expect(source).toContain("coach-layout grid min-h-0");
  expect(source).toContain('SvgIcon name="thumbsUp"');
  expect(source).toContain('SvgIcon name="thumbsDown"');
  expect(source).toContain("toggleMessageFeedback");
  expect(source).toContain("bestEnglishSpeechVoice");
  expect(source).toContain("utterance.voice = bestEnglishSpeechVoice()");
  expect(source).toContain("utterance.pitch = 1.02");
  expect(source).toContain("aria-pressed={messageFeedback[index] === \"like\"}");
  expect(source).toContain("aria-pressed={messageFeedback[index] === \"dislike\"}");
  expect(styles).toContain(".coach-feedback-active:hover");
  expect(source).toContain("coach-thinking-dots");
  expect(source).toContain("AbortController");
  expect(source).toContain("stopThinking");
  expect(source).toContain("Parar respuesta del profesor");
  expect(source).toContain("signal: controller.signal");
  expect(source).toContain("selectedImage");
  expect(source).toContain("prepareImageForVocabulary");
  expect(source).toContain("stripEphemeralImages");
  expect(source).toContain('accept="image/*"');
  expect(source).toContain("Agregar foto para vocabulario");
  expect(source).toContain("coach-message-image");
  expect(source).toContain("coach-image-preview");
  expect(source).toContain('SvgIcon name="mic"');
  expect(source).toContain('name={loading ? "stop" : "send"}');
  expect(source).toContain("coach-text-input-shell");
  expect(source).toContain("coach-inline-plus-button");
  expect(styles).toContain(".coach-text-input-shell");
  expect(styles).toContain(".coach-inline-plus-button");
  expect(styles).toContain("bottom: 0.46rem;");
  expect(styles).toContain(".coach-image-preview");
  expect(styles).toContain(".coach-message-image");
  expect(styles).toContain("max-width: 7rem;");
  expect(styles).toContain("max-height: 7rem;");
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
