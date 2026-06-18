import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const storageState = process.env.E2E_AUTH_STATE || undefined;
const useLocalWebServer = process.env.E2E_USE_WEB_SERVER !== "0";
const usePrebuiltApp = process.env.E2E_PREBUILT === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: useLocalWebServer
      ? {
        command: usePrebuiltApp
          ? "npm run start -- --hostname 127.0.0.1 --port 3000"
          : "npm run build && npm run start -- --hostname 127.0.0.1 --port 3000",
        url: "http://127.0.0.1:3000",
        env: {
          ...process.env,
          E2E_DEMO: "1",
          NEXT_PUBLIC_E2E_DEMO: "1",
          // Test-only Clerk key. Demo middleware bypasses authentication and no
          // request is made to a real Clerk tenant.
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
            "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
        },
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
  use: {
    baseURL,
    storageState,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
