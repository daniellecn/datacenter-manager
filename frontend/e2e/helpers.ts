/**
 * Shared Playwright helpers for E2E tests.
 */
import type { Page } from "@playwright/test";

export const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Admin123!";
export const READONLY_USERNAME = process.env.E2E_READONLY_USERNAME ?? "readonly_e2e";
export const READONLY_PASSWORD = process.env.E2E_READONLY_PASSWORD ?? "ReadOnly123!";

/**
 * Log in via the UI and wait for the dashboard to load.
 */
export async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for redirect to dashboard or change-password page
  await page.waitForURL(/(dashboard|change-password)/);
}

/**
 * Log out via the UI.
 */
export async function logout(page: Page) {
  // Open user menu or navigate to logout
  const userMenuBtn = page.locator("[data-testid='user-menu'], button:has-text('Logout')").first();
  if (await userMenuBtn.isVisible()) {
    await userMenuBtn.click();
    const logoutItem = page.getByRole("menuitem", { name: /logout/i });
    if (await logoutItem.isVisible()) {
      await logoutItem.click();
    }
  }
  await page.waitForURL(/login/);
}
