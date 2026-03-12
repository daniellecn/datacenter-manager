/**
 * E2E: Token refresh mid-session.
 *
 * Simulates an access token expiry by:
 *  1. Logging in (gets a short-lived access token in localStorage)
 *  2. Artificially clearing / corrupting the access token in localStorage
 *  3. Verifying that the axios interceptor performs a transparent refresh
 *     so the user stays logged in and sees valid data.
 *
 * NOTE: The real access token expires in 15 minutes. We simulate expiry by
 * directly manipulating localStorage to replace the token with an expired one.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_USERNAME, loginAs } from "./helpers";

// A valid JWT structure but definitely expired (exp in 2020)
const EXPIRED_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiJ0ZXN0IiwidHlwZSI6ImFjY2VzcyIsImp0aSI6InRlc3QiLCJleHAiOjE1OTAwMDAwMDB9." +
  "fake-signature";

test.describe("Token refresh mid-session", () => {
  test("app performs transparent refresh when access token expires", async ({ page }) => {
    // 1. Login normally
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/dashboard/);

    // 2. Replace the access token with an expired one in localStorage/auth store
    await page.evaluate((expiredToken) => {
      // Zustand persists auth state to localStorage under 'auth-storage' key
      const raw = localStorage.getItem("auth-storage");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.state) {
          parsed.state.accessToken = expiredToken;
          localStorage.setItem("auth-storage", JSON.stringify(parsed));
        }
      }
    }, EXPIRED_ACCESS_TOKEN);

    // 3. Navigate to a page that requires auth
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // 4. The app should transparently refresh and still show the devices page
    //    (not redirect to login, not show an error)
    await expect(page).not.toHaveURL(/login/);

    // The devices page header should be visible, meaning the request succeeded
    await expect(page.getByRole("heading", { name: /devices/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("session expires gracefully when refresh token is also invalid", async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);

    // Remove both tokens to simulate full expiry
    await page.evaluate(() => {
      localStorage.removeItem("auth-storage");
      // Also clear any cookie-based auth
      document.cookie.split(";").forEach((c) => {
        const key = c.split("=")[0].trim();
        document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    });

    // Navigate to a protected page
    await page.goto("/devices");

    // Should redirect to login (cannot refresh — no tokens at all)
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
