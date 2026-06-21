import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function openCoach(page: any) {
  await page.addInitScript(() => {
    window.localStorage.removeItem("english-os-coach-theme");
    window.localStorage.removeItem("english-os-coach-text-size");
    window.localStorage.removeItem("english-os-coach-sidebar");
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("english-os-coach:")) window.localStorage.removeItem(key);
    }
  });
  await page.goto("/coach", { waitUntil: "domcontentloaded" });
}

async function requireUi(page: any, options: { openSidebar?: boolean } = {}) {
  const signIn = page.getByRole("button", { name: /sign in/i });
  await expect(signIn.or(page.locator("article").first())).toBeVisible();
  if (await signIn.isVisible().catch(() => false)) test.skip(true, "Auth or demo required.");
  const showPanel = page.getByRole("button", { name: /Mostrar panel/i });
  if (options.openSidebar && await showPanel.isVisible().catch(() => false)) await showPanel.click();
  if (options.openSidebar) await expect(page.getByText(/Objetivo activo/i).first()).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
}

async function expectVisibleText(page: any, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible();
}

test("loads coach or sign in", async ({ page }) => {
  await openCoach(page);
  await expect(
    page
      .getByRole("button", { name: /sign in/i })
      .or(page.getByText(/Objetivo activo/i).first())
      .or(page.getByText(/PROFESOR DIJO/i).first())
      .first(),
  ).toBeVisible();
});
test("shows simplified two-column shell", async ({ page }) => {
  test.skip(page.viewportSize()?.width ? page.viewportSize()!.width < 700 : false, "Desktop shell is verified on desktop.");
  await openCoach(page);
  await requireUi(page, { openSidebar: true });
  await expect(page.locator("header:not(.hidden)")).toHaveCount(0);
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
  await requireUi(page, { openSidebar: true });

  const leftPanel = page.getByText(/Objetivo activo/i).first();
  const chat = page.locator("article").first();
  const leftBox = await leftPanel.boundingBox();
  const chatBox = await chat.boundingBox();

  expect(leftBox).not.toBeNull();
  expect(chatBox).not.toBeNull();
  expect(leftBox!.x).toBeLessThanOrEqual(chatBox!.x);
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

test("keeps focus and inserts dictated text from the microphone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "Microphone layout and dictation are verified in the mobile project.");
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      onresult?: (event: any) => void;
      onend?: () => void;
      start() {
        window.setTimeout(() => {
          this.onresult?.({
            results: [[{ transcript: "I usually work better in the morning" }]],
          });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openCoach(page);
  await expect(page.locator("article").first()).toBeVisible();

  const input = page.getByPlaceholder(/Escribe tu respuesta en ingl/i);
  await input.focus();
  await page.locator(".coach-mic-button").click();
  await expect(input).toHaveValue(/I usually work better in the morning/);
  await expect.poll(async () => page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
});

test("renders user messages as one compact inline line", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "The compact inline user-line contract is verified on desktop; mobile wrapping is covered by the mobile readability test.");
  await openCoach(page);
  await requireUi(page);

  const input = page.getByPlaceholder(/Escribe tu respuesta en inglés/i);
  await input.fill("Hola, podemos ver la clase 1 de la unidad 5?");
  await page.getByRole("button", { name: /Enviar respuesta/i }).click();

  const userMessage = page.locator(".coach-message-user").last();
  const label = userMessage.locator(".coach-user-message-label");
  const line = userMessage.locator(".coach-user-message-line");
  const content = userMessage.locator(".coach-user-message-content");
  await expect(label).toHaveText(/Tú —/);
  await expect(content).toContainText("Hola, podemos ver la clase 1 de la unidad 5?");

  const labelBox = await label.boundingBox();
  const contentBox = await content.boundingBox();
  const lineBox = await line.boundingBox();
  const lineStyles = await line.evaluate((node) => {
    const styles = window.getComputedStyle(node as HTMLElement);
    return {
      alignItems: styles.alignItems,
      display: styles.display,
    };
  });
  expect(labelBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(lineStyles.display).toBe("inline-flex");
  expect(lineStyles.alignItems).toBe("center");
  expect(contentBox!.x).toBeGreaterThanOrEqual(labelBox!.x + labelBox!.width);
  expect(lineBox!.height).toBeLessThan(28);
});

test("keeps coach lesson readable on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-safari", "Mobile layout is verified in the mobile project.");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCoach(page);
  await expect(page.getByRole("button", { name: /Mostrar panel/i })).toBeVisible();
  await expect(page.locator("#coach-sidebar")).toHaveCount(0);
  await expect(page.locator("article").first()).toBeVisible();

  const chatPanel = page.locator(".coach-chat").first();
  const lessonText = page.locator("article .prose p").first();
  const teacherActions = page.locator(".coach-message-teacher .coach-message-actions").first();
  const actionButtons = teacherActions.locator("button");

  await expect(chatPanel).toBeVisible();
  await expect(lessonText).toBeVisible();
  await expect(teacherActions).toBeVisible();
  await expect(actionButtons.first()).toBeVisible();

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);

  const chatBox = await chatPanel.boundingBox();
  const actionsBox = await teacherActions.boundingBox();
  const firstButtonBox = await actionButtons.nth(0).boundingBox();
  const secondButtonBox = await actionButtons.nth(1).boundingBox();
  expect(chatBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(firstButtonBox).not.toBeNull();
  expect(secondButtonBox).not.toBeNull();
  expect(chatBox!.x).toBeLessThanOrEqual(12);
  expect(chatBox!.width).toBeLessThanOrEqual(viewportWidth);
  expect(actionsBox!.x + actionsBox!.width).toBeLessThanOrEqual(viewportWidth);
  expect(Math.abs(firstButtonBox!.y - secondButtonBox!.y)).toBeLessThan(4);

  const micButton = page.locator(".coach-mic-button");
  const input = page.getByPlaceholder(/Escribe tu respuesta en ingl/i);
  await input.focus();
  await expect.poll(async () => page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
  const textareaFontSize = await input.evaluate((node) => window.getComputedStyle(node as HTMLElement).fontSize);
  expect(parseFloat(textareaFontSize)).toBeGreaterThanOrEqual(16);
  const documentWidthAfterInputFocus = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidthAfterInputFocus).toBeLessThanOrEqual(viewportWidth);

  await expect(micButton).toBeVisible();
  await micButton.click();
  const composerBox = await page.locator(".coach-composer").boundingBox();
  const inputRowBox = await page.locator(".coach-input-row").boundingBox();
  expect(composerBox).not.toBeNull();
  expect(inputRowBox).not.toBeNull();
  expect(composerBox!.x).toBeGreaterThanOrEqual(0);
  expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
  expect(inputRowBox!.x + inputRowBox!.width).toBeLessThanOrEqual(viewportWidth + 1);
  const documentWidthAfterMic = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidthAfterMic).toBeLessThanOrEqual(viewportWidth);

  await page.getByRole("button", { name: /Mostrar panel/i }).click();
  await expect(page.locator("#coach-sidebar")).toBeVisible();
  await page.getByRole("button", { name: /Ocultar panel/i }).click();
  await expect(page.locator("#coach-sidebar")).toHaveCount(0);
  const collapsedChatBox = await chatPanel.boundingBox();
  expect(collapsedChatBox).not.toBeNull();
  expect(collapsedChatBox!.x).toBeLessThanOrEqual(12);
  expect(collapsedChatBox!.width).toBeLessThanOrEqual(viewportWidth);
});

test("changes themes and collapses the complete left panel", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openCoach(page);
  await requireUi(page, { openSidebar: true });

  await page.locator("select.coach-theme-select").selectOption("sage");
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
  const pageController = await fs.readFile("src/modules/coach-page/useCoachPageController.ts", "utf8");
  const materialsPanel = await fs.readFile("src/modules/coach-resources/CoachClassMaterialsPanel.tsx", "utf8");
  const guidesPanel = await fs.readFile("src/modules/coach-resources/CoachGuidesPanel.tsx", "utf8");
  const messageList = await fs.readFile("src/modules/coach-chat/CoachMessageList.tsx", "utf8");
  const messageListViewModel = await fs.readFile("src/modules/coach-chat/messageListViewModel.ts", "utf8");
  const composer = await fs.readFile("src/modules/coach-chat/CoachComposer.tsx", "utf8");
  const composerViewModel = await fs.readFile("src/modules/coach-chat/composerViewModel.ts", "utf8");
  const actions = await fs.readFile("src/modules/coach-actions/coachActions.ts", "utf8");
  const topBar = await fs.readFile("src/modules/coach-layout/CoachTopBar.tsx", "utf8");
  const persistence = await fs.readFile("src/modules/coach-persistence/coachPersistence.ts", "utf8");
  const media = await fs.readFile("src/modules/coach-media/coachMedia.ts", "utf8");
  const controller = await fs.readFile("src/modules/coach-controller/coachController.ts", "utf8");
  const contextController = await fs.readFile("src/modules/coach-context/coachContext.ts", "utf8");
  const runtime = await fs.readFile("src/modules/coach-runtime/coachRuntime.ts", "utf8");
  const styles = await fs.readFile("src/app/globals.css", "utf8");
  const qaOverrides = await fs.readFile("src/app/coach-qa-overrides.css", "utf8");

  expect(materialsPanel).toContain('data-testid="resource-card"');
  expect(pageController).toContain("resourcesNotice");
  expect(pageController).toContain("Los materiales conectados no están configurados");
  expect(pageController).toContain("Descargar XLSX");
  expect(pageController).toContain("Abrir en Sheets");
  expect(guidesPanel).toContain("coach-workbook-card");
  expect(styles).toContain(".coach-message-user .coach-message-actions { display: none; }");
  expect(styles).toContain(".coach-message-teacher { padding-right: 0; }");
  expect(styles).toContain(".coach-message-teacher .prose::before");
  expect(styles).toContain("float: right;");
  expect(styles).toContain("width: 13.25rem;");
  expect(styles).toContain("padding-right: 13.5rem;");
  expect(styles).toContain(".coach-user-message-line");
  expect(styles).toContain(".coach-user-message-label");
  expect(styles).toContain(".coach-user-message-content");
  expect(messageList).toContain("coach-user-message-line");
  expect(messageListViewModel).toContain("Tú —");
  expect(styles).toContain(".coach-message-user .coach-message-label p::after");
  expect(styles).toContain('.coach-message-user .coach-message-label p { display: inline; margin: 0; }');
  expect(styles).toContain('.coach-message-user .prose p { display: inline; margin: 0; }');
  expect(styles).toContain("background: #fff;");
  expect(styles).toContain(".coach-textarea::placeholder");
  expect(styles).toContain("iOS Safari auto-zooms");
  expect(styles).toContain("font-size: 16px;");
  expect(qaOverrides).toContain("iOS Safari auto-zooms");
  expect(qaOverrides).toContain("font-size: 16px;");
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
  expect(pageController).toContain('type CoachTheme = "slate" | "paper" | "sage" | "sand" | "blue"');
  expect(pageController).toContain('type CoachTextSize = "compact" | "normal" | "large"');
  expect(persistence).toContain("english-os-coach-text-size");
  expect(pageController).toContain("saveCoachPreferences");
  expect(source).toContain("data-text-size={state.textSize}");
  expect(topBar).toContain("Disminuir tamaño de texto");
  expect(topBar).toContain("Aumentar tamaño de texto");
  expect(pageController).toContain("studyModeLabel");
  expect(topBar).toContain("coach-status-brand");
  expect(topBar).toContain("EnglishOsLogo");
  expect(styles).toContain(".coach-status-logo");
  expect(topBar).toContain("coach-panel-toggle");
  expect(source).toContain("textareaRef: refs.textareaRef");
  expect(composer).toContain("rows={1}");
  expect(source).toContain("coach-shell h-[100dvh] max-w-full overflow-hidden");
  expect(source).toContain("coach-layout grid min-h-0");
  expect(messageListViewModel).toContain('icon: "thumbsUp"');
  expect(messageListViewModel).toContain('icon: "thumbsDown"');
  expect(messageListViewModel).toContain('icon: "flag"');
  expect(pageController).toContain("reportMessage");
  expect(messageListViewModel).toContain("Reportar error en esta respuesta");
  expect(actions).toContain("mailto:info@citizen-life.com");
  expect(pageController).toContain("buildProgressSnapshot");
  expect(contextController).toContain("Avance:");
  expect(pageController).toContain("toggleMessageFeedback");
  expect(media).toContain("selectBestEnglishSpeechVoice");
  expect(runtime).toContain("createSpeechPayload");
  expect(runtime).toContain("utterance.voice = speech.voice");
  expect(pageController).toContain("speakCoachMessageRuntime");
  expect(media).toContain("pitch: 1.02");
  expect(messageList).toContain("aria-pressed={message.likeAction.pressed}");
  expect(messageList).toContain("aria-pressed={message.dislikeAction.pressed}");
  expect(messageListViewModel).toContain("messageFeedback");
  expect(styles).toContain(".coach-feedback-active:hover");
  expect(messageList).toContain("coach-thinking-dots");
  expect(pageController).toContain("AbortController");
  expect(pageController).toContain("stopThinking");
  expect(pageController).toContain("stopCoachThinkingRuntime");
  expect(`${messageList}\n${composerViewModel}`).toContain("Parar respuesta del profesor");
  expect(pageController).toContain("signal: controller.signal");
  expect(pageController).toContain("selectedImage");
  expect(media).toContain("prepareImageForVocabulary");
  expect(controller).toContain("stripEphemeralImages");
  expect(composer).toContain("accept={model.fileInput.accept}");
  expect(composerViewModel).toContain("Agregar foto para vocabulario");
  expect(messageList).toContain("coach-message-image");
  expect(composer).toContain("coach-image-preview");
  expect(composerViewModel).toContain('icon: "mic"');
  expect(composerViewModel).toContain('icon: params.loading ? "stop" : "send"');
  expect(composer).toContain("coach-text-input-shell");
  expect(composerViewModel).toContain("coach-inline-plus-button");
  expect(styles).toContain(".coach-text-input-shell");
  expect(styles).toContain(".coach-inline-plus-button");
  expect(styles).toContain("bottom: 0.46rem;");
  expect(styles).toContain(".coach-image-preview");
  expect(styles).toContain(".coach-message-image");
  expect(styles).toContain("max-width: 7rem;");
  expect(styles).toContain("max-height: 7rem;");
  expect(materialsPanel).toContain("Cargar reproductor");
  expect(materialsPanel).toContain("expandedResourceId === resource.id");
  expect(materialsPanel).toContain("min-w-0 max-w-full overflow-hidden");
  expect(materialsPanel).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
  expect(materialsPanel).toContain('loading="lazy"');
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
