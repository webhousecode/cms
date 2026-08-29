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

  // F146 prefixes admin links with the site slug (/admin/<site>/agents/...),
  // so an href that pinned "/admin/agents/" matched nothing any more.
  const agentLink = page
    .locator('a[href*="/agents/"]:not([href$="/new"])')
    .first();
  await expect(agentLink).toBeVisible({ timeout: 10_000 });
  await agentLink.click();
  // Confirm we actually LANDED on an agent — not that some sidebar link exists.
  // The original asserted `text="agents"` (matched the nav, not the page); my
  // first replacement asserted the nav TESTID, which is the same mistake with a
  // better selector. What the helper is for is the navigation.
  await expect(page).toHaveURL(/\/agents\/[^/]+$/, { timeout: 15_000 });
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

    // Ensure at least one target collection is set.
    //
    // This drove the picker by its TEXT NODE and read options by
    // `[data-slot="custom-select-option"]`. The span is not the control, so the
    // click waited for a text node to become "visible, enabled and stable" and
    // retried 156 times until the 90s budget ran out. CustomSelect's own anchors
    // are custom-select-trigger and custom-select-option-<value>.
    const addPicker = page.getByTestId("custom-select-trigger").first();
    if (await addPicker.isVisible()) {
      await addPicker.click();
      const options = page.locator(
        '[data-testid^="custom-select-option-"]:not([data-testid$="custom-select-option-"])',
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
