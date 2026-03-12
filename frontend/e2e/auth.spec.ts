/**
 * E2E: Authentication flows.
 *
 * Tests:
 *  - Login with valid credentials → redirects to dashboard
 *  - Login with invalid credentials → shows error
 *  - Logout → redirects to login page
 *  - Navigating to protected route while unauthenticated → redirects to login
 */
import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_USERNAME, loginAs, logout } from "./helpers";

test.describe("Authentication", () => {
  test("login with valid credentials redirects to dashboard", async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByText(/dashboard/i).first()).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/username/i).fill(ADMIN_USERNAME);
    await page.getByLabel(/password/i).fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/incorrect username or password/i)
    ).toBeVisible();
    // Must stay on login page
    await expect(page).toHaveURL(/login/);
  });

  test("login with unknown user shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/username/i).fill("no_such_user_xyz_e2e");
    await page.getByLabel(/password/i).fill("anypassword123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/incorrect username/i)).toBeVisible();
  });

  test("protected route redirects unauthenticated user to login", async ({ page }) => {
    // Clear any stored auth state
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });

  test("logout redirects to login page", async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/dashboard/);

    // Find and click logout
    await logout(page);
    await expect(page).toHaveURL(/login/);
  });

  test("after logout, old route requires re-authentication", async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await logout(page);

    // Try to go to devices directly
    await page.goto("/devices");
    await expect(page).toHaveURL(/login/);
  });
});
