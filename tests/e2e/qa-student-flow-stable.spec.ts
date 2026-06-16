import { expect, test, type Page } from "@playwright/test";

const qaEmail = process.env.QA_STUDENT_EMAIL || "pfigueroamiranda@gmail.com";
const qaAccess = process.env.ENGLISH_OS_QA_TOKEN || process.env.QA_TOKEN || "";

async function openQA(page: Page) {
  if (!qaAccess) throw new Error("Missing QA access secret.");
  const url = `/qa?qa_token=${encodeURIComponent(qaAccess)}&qa_email=${encodeURIComponent(qaEmail)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Adaptive Learning UX/i })).toBeVisible();
  await expect(page.getByText("QA mode").first()).toBeVisible();
  await expect(page.getByText("Mission Control Dashboard")).toBeVisible();
}

async function waitForClassMaterial(page: Page) {
  await expect(page.getByText("Class material", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Loading class material/i)).toHaveCount(0);
}

async function closeCoach(page: Page) {
  const close = page.getByRole("button", { name: /Cerrar Coach/i });
  if ((await close.count()) > 0 && (await close.first().isVisible().catch(() => false))) {
    await close.first().click();
  }
}

test.describe("English OS unified QA student flow", () => {
  test("completes current class, material, coach, practice, summary and simulated approval", async ({ page }) => {
    await openQA(page);

    await test.step("Mission Control is ready", async () => {
      await expect(page.getByRole("button", { name: /Continue Current Class/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Start Adaptive Practice/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Coach integrado$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Tema:/i })).toBeVisible();
    });

    await test.step("Current Class exposes the class player actions", async () => {
      await page.getByRole("button", { name: /^Current Class$/i }).click();
      await expect(page.getByText("Class Player")).toBeVisible();
      await expect(page.getByText("Unit 4 — Class 28").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^Ver clase$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Enseñar esta clase con Coach/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Practice this class/i })).toBeVisible();
    });

    await test.step("Class material opens Class 28 and Class 22", async () => {
      await page.getByRole("button", { name: /^Ver clase$/i }).click();
      await waitForClassMaterial(page);
      await expect(page.getByText(/Video Class mode/i)).toBeVisible();

      await page.getByRole("button", { name: /^Class 22$/i }).click();
      await waitForClassMaterial(page);
      await expect(page.getByText(/Student Book content/i)).toBeVisible();
      await expect(page.locator("pre").filter({ hasText: /What's your best time of day|race off/i }).first()).toBeVisible();
    });

    await test.step("Coach works from the same student experience", async () => {
      await page.getByRole("button", { name: /Enseñar esta clase con Coach/i }).last().click();
      await expect(page.getByText(/Coach integrado/i).first()).toBeVisible();
      await expect(page.getByText(/Modo QA/i).first()).toBeVisible();
      await closeCoach(page);

      await page.getByRole("button", { name: /^Coach integrado$/i }).click();
      await page.getByRole("button", { name: /Repasar U4/i }).click();
      await expect(page.getByText(/What is your best time of day/i)).toBeVisible();
      await closeCoach(page);
    });

    await test.step("Practice catches known errors and approves B2 answer", async () => {
      await page.getByRole("button", { name: /^Practice$/i }).click();
      await expect(page.getByText("Practice flow")).toBeVisible();
      await expect(page.getByText("Before you submit")).toBeVisible();

      await page.getByRole("button", { name: /Test 3: although vs despite/i }).click();
      await page.getByRole("button", { name: /Analyze practice/i }).click();
      await expect(page.getByText(/Although vs despite/i)).toBeVisible();

      await page.getByRole("button", { name: /Practice Again/i }).click();
      await page.getByRole("button", { name: /Test 4: incomplete advice/i }).click();
      await page.getByRole("button", { name: /Analyze practice/i }).click();
      await expect(page.getByText(/Business advice without final strategic consequence/i)).toBeVisible();

      await page.getByRole("button", { name: /Practice Again/i }).click();
      await page.getByRole("button", { name: /Test 5: B2 acceptable/i }).click();
      await page.getByRole("button", { name: /Analyze practice/i }).click();
      await expect(page.getByText(/Eligible for approval/i)).toBeVisible();
      await page.getByRole("button", { name: /Approve Practice/i }).click();
      await expect(page.getByText(/QA approval simulated/i)).toBeVisible();
    });
  });
});
