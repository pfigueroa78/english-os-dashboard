import { expect, test, type Page } from "@playwright/test";

const qaEmail = process.env.QA_STUDENT_EMAIL || "pfigueroamiranda@gmail.com";
const qaToken = process.env.ENGLISH_OS_QA_TOKEN || process.env.QA_TOKEN || "";

async function closeCoachIfOpen(page: Page) {
  const closeCoach = page.getByRole("button", { name: /Cerrar Coach/i });
  if ((await closeCoach.count()) > 0 && (await closeCoach.first().isVisible().catch(() => false))) {
    await closeCoach.first().click();
  }
}

async function openQaStudentExperience(page: Page) {
  if (!qaToken) {
    throw new Error("Missing ENGLISH_OS_QA_TOKEN or QA_TOKEN environment variable.");
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, email }) => {
      window.localStorage.setItem("english-os-qa-token", token);
      window.localStorage.setItem("english-os-qa-email", email);
    },
    { token: qaToken, email: qaEmail }
  );

  await page.goto("/qa", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Adaptive Learning UX/i })).toBeVisible();
  await expect(page.getByText("QA mode").first()).toBeVisible();
  await expect(page.getByText("Mission Control Dashboard")).toBeVisible();
}

test.describe("English OS QA student flow", () => {
  test("navigates class, unit review, practice, summary, and simulated approval", async ({ page }) => {
    await openQaStudentExperience(page);

    await test.step("Mission Control loads as QA student", async () => {
      await expect(page.getByText(/Business advice with contrast/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Continue Current Class/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Start Adaptive Practice/i })).toBeVisible();
    });

    await test.step("Current Class shows class 28 review state", async () => {
      await page.getByRole("button", { name: /^Current Class$/i }).click();
      await expect(page.getByText("Unit 4 — Class 28").first()).toBeVisible();
      await expect(page.getByText(/Video Class \/ Integrated Review/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Practice this class/i })).toBeVisible();
    });

    await test.step("Class material viewer opens video class and student class", async () => {
      await page.getByRole("button", { name: /^Ver clase$/i }).first().click();
      await expect(page.getByText("Class material")).toBeVisible();
      await expect(page.getByText(/Class 28|Unit 4 — Class 28/i).first()).toBeVisible();
      await expect(page.getByText(/Video Class mode/i)).toBeVisible();

      await page.getByRole("button", { name: /^Class 22$/i }).click();
      await expect(page.getByText(/Student Book content/i)).toBeVisible();
      await expect(page.getByText(/best time of day/i)).toBeVisible();
    });

    await test.step("Integrated Coach teaches from selected class without leaving UI", async () => {
      await page.getByRole("button", { name: /Enseñar esta clase con Coach/i }).click();
      await expect(page.getByText(/Coach integrado/i).first()).toBeVisible();
      await expect(page.getByText(/Modo QA/i).first()).toBeVisible();
    });

    await test.step("Unit 4 review prompt starts in the integrated coach", async () => {
      await closeCoachIfOpen(page);

      await page.getByRole("button", { name: /^Coach integrado$/i }).first().click();
      await page.getByRole("button", { name: /Repasar U4/i }).click();
      await expect(page.getByText(/What is your best time of day/i)).toBeVisible();

      await closeCoachIfOpen(page);
    });

    await test.step("Practice catches although vs despite error", async () => {
      await page.getByRole("button", { name: /^Practice$/i }).click();
      await page.getByRole("button", { name: /Test 3: although vs despite/i }).click();
      await page.getByRole("button", { name: /Analyze practice/i }).click();
      await expect(page.getByText(/Although vs despite/i)).toBeVisible();
      await expect(page.getByText(/Although Bogotá has many job opportunities/i)).toBeVisible();
    });

    await test.step("Practice catches incomplete business advice", async () => {
      await page.getByRole("button", { name: /Practice Again/i }).click();
      await page.getByRole("button", { name: /Test 4: incomplete advice/i }).click();
      await page.getByRole("button", { name: /Analyze practice/i }).click();
      await expect(page.getByText(/Business advice without final strategic consequence/i)).toBeVisible();
    });

    await test.step("B2 answer becomes eligible and approval is simulated", async () => {
      await page.getByRole("button", { name: /Practice Again/i }).click();
      await page.getByRole("button", { name: /Test 5: B2 acceptable/i }).click();
      await page.getByRole("button", { name: /Analyze practice/i }).click();
      await expect(page.getByText(/Eligible for approval/i)).toBeVisible();
      await page.getByRole("button", { name: /Approve Practice/i }).click();
      await expect(page.getByText(/QA approval simulated/i)).toBeVisible();
    });
  });
});
