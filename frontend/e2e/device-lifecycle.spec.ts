/**
 * E2E: Device lifecycle — Login → navigate to racks → add device → verify in list → delete.
 *
 * This is the primary "happy path" integration test covering the core workflow.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_USERNAME, loginAs } from "./helpers";

const UNIQUE_SERIAL = `E2E-SN-${Date.now()}`;
const DEVICE_NAME = `e2e-server-${Date.now()}`;

test.describe("Device lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USERNAME, ADMIN_PASSWORD);
  });

  test("navigates to Devices page via sidebar", async ({ page }) => {
    // Click the "Devices" link in the sidebar
    await page.getByRole("link", { name: /devices/i }).first().click();
    await expect(page).toHaveURL(/devices/);
    await expect(page.getByRole("heading", { name: /devices/i }).first()).toBeVisible();
  });

  test("create device → verify in list → delete", async ({ page }) => {
    // ── Navigate to Devices ──────────────────────────────────────────────────
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    // ── Create a new device ──────────────────────────────────────────────────
    const addBtn = page.getByRole("button", { name: /add device|new device|create/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // Fill in device creation form
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/name/i).fill(DEVICE_NAME);

    // Select device type
    const typeSelect = dialog.getByLabel(/device type|type/i).first();
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption("server");
    }

    await dialog.getByLabel(/serial/i).fill(UNIQUE_SERIAL);

    // Submit
    await dialog.getByRole("button", { name: /save|create|add/i }).click();

    // ── Verify device appears in list ────────────────────────────────────────
    await expect(page.getByText(DEVICE_NAME)).toBeVisible({ timeout: 10_000 });

    // ── Delete the device ────────────────────────────────────────────────────
    // Find the row for our device and click delete
    const deviceRow = page.locator(`tr:has-text("${DEVICE_NAME}")`).first();
    await expect(deviceRow).toBeVisible();

    // Click the actions menu or delete button in the row
    const deleteBtn = deviceRow.getByRole("button", { name: /delete|remove/i }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      // Confirm if there's a confirmation dialog
      const confirmBtn = page.getByRole("button", { name: /confirm|yes|delete/i }).last();
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
    }

    // Verify the device is no longer visible in the default list
    // (soft-delete → status=inactive, excluded from default list)
    await page.waitForTimeout(500);
    await expect(page.getByText(DEVICE_NAME)).not.toBeVisible({ timeout: 5_000 });
  });

  test("device detail page shows all tabs", async ({ page }) => {
    // Navigate to devices list and click on the first device
    await page.goto("/devices");
    await page.waitForLoadState("networkidle");

    const firstDevice = page.getByRole("link", { name: /details|view/i }).first();
    if (await firstDevice.isVisible()) {
      await firstDevice.click();
      await page.waitForURL(/devices\//);

      // Check tabs are visible
      for (const tab of ["Overview", "Interfaces", "Connections"]) {
        await expect(page.getByRole("tab", { name: tab })).toBeVisible();
      }
    }
  });
});
