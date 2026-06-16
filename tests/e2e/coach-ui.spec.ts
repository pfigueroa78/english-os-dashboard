import { expect, test, type Page } from "@playwright/test";

const authenticatedOnly = Boolean(process.env.E2E_AUTH_STATE);

async function openCoach(page: Page) {
  await page.goto("/coach", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function isSignedIn(page: Page) {
  const signIn = page.getByRole("button", { name: /sign in/i });
  const coachTitle = page.getByRole("heading", { name: /^Coach$/i });

  if (await signIn.isVisible().catch(() => false)) return false;
  await expect(coachTitle).toBeVisible();
  return true;
}

async function requireSignedIn(page: Page) {
  if (!(await isSignedIn(page))) {
    test.skip(!authenticatedOnly, "Authenticated traversal requires E2E_AUTH_STATE storage state.");
  }
}

test.describe("English OS Coach accepted baseline", () => {
  test("loads the coach entrypoint or sign-in gate", async ({ page }) => {
    await openCoach(page);

    const signIn = page.getByRole("button", { name: /sign in/i });
    const coachTitle = page.getByRole("heading", { name: /^Coach$/i });

    await expect(signIn.or(coachTitle)).toBeVisible();
  });

  test("traverses the accepted guided-class shell", async ({ page }) => {
    await openCoach(page);
    await requireSignedIn(page);

    await expect(page.getByText("English OS", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Coach$/i })).toBeVisible();
    await expect(page.getByText(/Unidad/i)).toBeVisible();
    await expect(page.getByText(/Clase/i)).toBeVisible();
    await expect(page.getByText(/Tokens/i)).toBeVisible();
    await expect(page.getByText(/Costo/i)).toBeVisible();

    await expect(page.getByRole("button", { name: /Continuar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Gramática/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Vocabulario/i })).toBeVisible();

    await expect(page.getByPlaceholder(/Responde la evaluación/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send$/i })).toBeVisible();
  });

  test("preserves the conversational class guidance and evaluation gate language", async ({ page }) => {
    await openCoach(page);
    await requireSignedIn(page);

    await expect(page.getByText(/Hola\. Estoy listo para guiar tu clase de English OS/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Unidad activa:/i)).toBeVisible();
    await expect(page.getByText(/Clase \/ lección actual:/i)).toBeVisible();
    await expect(page.getByText(/El avance se habilita solo después de aprobar la evaluación/i)).toBeVisible();
  });

  test("checks study side panel, resources and specialist actions", async ({ page }) => {
    await openCoach(page);
    await requireSignedIn(page);

    await expect(page.getByText(/Study unit/i)).toBeVisible();
    await expect(page.getByLabel(/Unidad de estudio/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Usar actual/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Clase$/i })).toBeVisible();

    await expect(page.getByText(/Unit workbooks/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Excel gramática/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Excel vocabulario/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Guía de gramática en chat/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Guía de vocabulario en chat/i })).toBeVisible();

    await expect(page.getByText(/Specialist agent/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Grammar/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Speaking/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Evaluate/i })).toBeVisible();

    await expect(page.getByText(/Drive Materials/i)).toBeVisible();
  });

  test("can type a practice answer without sending accidentally", async ({ page }) => {
    await openCoach(page);
    await requireSignedIn(page);

    const input = page.getByPlaceholder(/Responde la evaluación/i);
    await input.fill("The way I see it, you ought to improve communication first.");
    await expect(input).toHaveValue(/ought to improve communication/);
    await expect(page.getByRole("button", { name: /^Send$/i })).toBeEnabled();
  });
});

test.describe("English OS MCP smoke", () => {
  test("MCP endpoint is present and protected", async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/mcp`);
    expect([200, 401, 403]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.name).toBe("english-os-mcp");
      expect(body.tools).toEqual(
        expect.arrayContaining([
          "english_os_get_learner_context",
          "english_os_get_current_class",
          "english_os_get_class_content",
          "passages_run_diagnostic",
          "conversation_analyze",
          "english_os_approve_current_class_practice",
          "english_os_advance_to_next_class",
        ])
      );
    }
  });
});
