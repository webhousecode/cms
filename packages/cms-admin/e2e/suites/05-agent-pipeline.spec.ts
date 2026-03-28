/**
 * F99 — Agent detail page tests.
 *
 * Verifies Target Collections, Field Defaults, autocomplete, and hydration.
 *
 * Migrated from: agent-detail.spec.ts
 * @see docs/features/F99-e2e-testing-suite.md
 */
import { test, expect } from "../fixtures/auth";
import { collectConsoleErrors } from "../fixtures/helpers";

/** Navigate to the first real agent (skip /admin/agents/new) */
async function goToFirstAgent(page: import("@playwright/test").Page) {
  await page.goto("/admin/agents");
  await page.waitForLoadState("networkidle");

  const agentLink = page
    .locator('a[href*="/admin/agents/"]:not([href$="/new"])')
    .first();
  await expect(agentLink).toBeVisible({ timeout: 10_000 });
  await agentLink.click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator('text="agents"').first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Agent detail page", () => {
  test("renders Target Collections and Field Defaults sections", async ({
    authedPage: page,
  }) => {
    await goToFirstAgent(page);

    await expect(
      page.getByText("Target Collections", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText("Which collections this agent generates content for."),
    ).toBeVisible();

    await expect(page.getByText("Field Defaults")).toBeVisible();

    const addBtn = page.getByText("Add default");
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const fieldInput = page.locator('input[placeholder="field name"]');
    await expect(fieldInput).toBeVisible();
  });

  test("Target Collections dropdown lists available collections", async ({
    authedPage: page,
  }) => {
    await goToFirstAgent(page);
    await page.waitForTimeout(1500);

    const addPicker = page.getByText("— add a collection —");
    const pickerVisible = await addPicker.isVisible();
    const hasChips =
      (await page.locator('span[style*="border-radius: 99px"]').count()) > 0;
    expect(pickerVisible || hasChips).toBeTruthy();
  });

  test("Field name autocomplete shows schema fields", async ({
    authedPage: page,
  }) => {
    await goToFirstAgent(page);
    await page.waitForTimeout(1500);

    // Ensure at least one target collection is set
    const addPicker = page.getByText("— add a collection —");
    if (await addPicker.isVisible()) {
      await addPicker.click();
      const options = page.locator(
        '[data-slot="custom-select-option"]:not(:has-text("— add"))',
      );
      if ((await options.count()) > 0) {
        await options.first().click();
      }
    }

    await page.waitForTimeout(1500);
    await page.getByText("Add default").click();

    const fieldInput = page.locator('input[placeholder="field name"]');
    await expect(fieldInput).toBeVisible();
    await fieldInput.click();
    await page.waitForTimeout(500);

    const autocompletePopup = page.locator(
      'div[style*="position: absolute"][style*="z-index"]',
    );
    const hasChips =
      (await page.locator('span[style*="border-radius: 99px"]').count()) > 0;

    if (hasChips) {
      await expect(autocompletePopup).toBeVisible({ timeout: 3_000 });
      const items = autocompletePopup.locator("button");
      expect(await items.count()).toBeGreaterThan(0);
    }
  });

  test("no hydration mismatch errors", async ({ authedPage: page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        msg.type() === "error" &&
        (text.includes("Hydration") || text.includes("hydrat"))
      ) {
        errors.push(text);
      }
    });

    await goToFirstAgent(page);
    await page.waitForTimeout(3000);

    expect(errors).toHaveLength(0);
  });
});
