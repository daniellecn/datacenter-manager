/**
 * Playwright E2E test configuration.
 *
 * Assumes the full stack is running:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up
 *
 * Base URL: http://localhost (Nginx → frontend on port 80)
 * API:      http://localhost/api/v1/...
 *
 * To run against the dev server directly:
 *   BASE_URL=http://localhost:5173 npx playwright test
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Avoid race conditions on shared DB state
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["line"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
