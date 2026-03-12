/**
 * E2E: Role-based access control — read_only user navigation.
 *
 * Verifies that a read_only user:
 *  - Can navigate to read-only pages
 *  - Cannot see admin-only navigation items (Users, Settings mutation actions)
 *  - Cannot see "Add", "Edit", "Delete" action buttons
 *  - Cannot access /admin/users page directly
 *
 * Requirements:
 *  - A read_only test user must exist in the database.
 *    Create via: POST /api/v1/users (as admin) with role=read_only
 *    Default: E2E_READONLY_USERNAME=readonly_e2e / E2E_READONLY_PASSWORD=ReadOnly123!
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  READONLY_PASSWORD,
  READONLY_USERNAME,
  loginAs,
} from "./helpers";

test.describe("RBAC — read_only user", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, READONLY_USERNAME, READONLY_PASSWORD);
  });

  test("read_only can navigate to dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();
  });

  test("read_only can view devices list", async ({ page }) => {
    await page.goto("/devices");
    await expect(page.getByRole("heading", { name: /devices/i }).first()).toBeVisible();
  });

  test("read_only cannot see Create/Add Device button", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // Mutating action buttons must not be present for read_only
    const addBtn = page.getByRole("button", { name: /add device|new device|create device/i });
    await expect(addBtn).not.toBeVisible();
  });

  test("read_only cannot see Delete button on device row", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    const deleteBtn = page.getByRole("button", { name: /delete/i }).first();
    if (await deleteBtn.isVisible()) {
      // If delete button is visible, it might still be disabled — check that
      // clicking it doesn't trigger deletion (UI should disable or hide it)
      await expect(deleteBtn).toBeDisabled();
    } else {
      // Preferred: not visible at all for read_only
      await expect(deleteBtn).not.toBeVisible();
    }
  });

  test("read_only cannot access User Management page", async ({ page }) => {
    // Attempt direct navigation to admin-only page
    await page.goto("/admin/users");
    // Should either redirect or show 403 / "not authorized" message
    const isRedirected = page.url().includes("/dashboard") || page.url().includes("/login");
    const hasErrorMsg = await page
      .getByText(/not authorized|access denied|forbidden/i)
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasErrorMsg).toBeTruthy();
  });

  test("read_only does not see User Management in sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    const userMgmtLink = page.getByRole("link", { name: /user management|users/i });
    await expect(userMgmtLink).not.toBeVisible();
  });
});

test.describe("RBAC — operator user mutations", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  });

  test("admin can see Create Device button", async ({ page }) => {
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");
    const addBtn = page.getByRole("button", { name: /add device|new device|create device/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test("admin can see User Management in sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    const userMgmtLink = page.getByRole("link", { name: /user management|users/i });
    await expect(userMgmtLink).toBeVisible();
  });
});
