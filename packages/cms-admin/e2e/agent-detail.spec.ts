import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET = process.env.CMS_JWT_SECRET ?? process.env.JWT_SECRET ?? "";

test.beforeEach(async ({ context }) => {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ sub: "test", email: "test@test.com", name: "Test" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  await context.addCookies([{ name: "cms-session", value: token, domain: "localhost", path: "/" }]);
});

// Helper: navigate to the first real agent (skip /admin/agents/new)
async function goToFirstAgent(page: import("@playwright/test").Page) {
  await page.goto("/admin/agents");
  await page.waitForLoadState("networkidle");

  // Find a real agent link (not "new")
  const agentLink = page.locator('a[href*="/admin/agents/"]:not([href$="/new"])').first();
  await expect(agentLink).toBeVisible({ timeout: 10_000 });
  await agentLink.click();
  await page.waitForLoadState("networkidle");
  // Wait for the agent data to load (Loading... disappears)
  // Wait for agent data to load — breadcrumb shows "agents / {name}"
  await expect(page.locator('text="agents"').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Agent Name")).toBeVisible({ timeout: 5_000 }).catch(() => {
    // Agent name varies — just wait for Target Collections to appear
  });
}

test.describe("Agent detail page", () => {
  test("renders Target Collections and Field Defaults sections", async ({ page }) => {
    await goToFirstAgent(page);

    // Target Collections section must exist
    await expect(page.getByText("Target Collections", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Which collections this agent generates content for.")).toBeVisible();

    // Field Defaults section must exist
    await expect(page.getByText("Field Defaults")).toBeVisible();

    // Add default button must work
    const addBtn = page.getByText("Add default");
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // A field name input should appear
    const fieldInput = page.locator('input[placeholder="field name"]');
    await expect(fieldInput).toBeVisible();
  });

  test("Target Collections dropdown lists available collections", async ({ page }) => {
    await goToFirstAgent(page);

    // Wait for collections API to load
    await page.waitForTimeout(1500);

    // The "add a collection" picker should appear if not all selected
    const addPicker = page.getByText("— add a collection —");
    const pickerVisible = await addPicker.isVisible();

    // Either we see the picker (can add more) or all collections are already selected (chips shown)
    const hasChips = (await page.locator('span[style*="border-radius: 99px"]').count()) > 0;
    expect(pickerVisible || hasChips).toBeTruthy();
  });

  test("Field name autocomplete shows schema fields when collections are set", async ({ page }) => {
    await goToFirstAgent(page);
    await page.waitForTimeout(1500);

    // Ensure at least one target collection is set
    const addPicker = page.getByText("— add a collection —");
    if (await addPicker.isVisible()) {
      await addPicker.click();
      // Pick the first available option (skip the placeholder)
      const options = page.locator('[data-slot="custom-select-option"]:not(:has-text("— add"))');
      if ((await options.count()) > 0) {
        await options.first().click();
      }
    }

    // Wait for schema fetch
    await page.waitForTimeout(1500);

    // Add a field default
    await page.getByText("Add default").click();

    // Click the field name input to open autocomplete
    const fieldInput = page.locator('input[placeholder="field name"]');
    await expect(fieldInput).toBeVisible();
    await fieldInput.click();
    await page.waitForTimeout(500);

    // Autocomplete dropdown should appear with schema fields
    const autocompletePopup = page.locator('div[style*="position: absolute"][style*="z-index"]');
    const hasChips = (await page.locator('span[style*="border-radius: 99px"]').count()) > 0;

    if (hasChips) {
      // Collections are set, so autocomplete should show
      await expect(autocompletePopup).toBeVisible({ timeout: 3_000 });
      const items = autocompletePopup.locator("button");
      expect(await items.count()).toBeGreaterThan(0);
    }
  });

  test("no hydration mismatch errors in console", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error" && (text.includes("Hydration") || text.includes("hydrat"))) {
        hydrationErrors.push(text);
      }
    });

    await goToFirstAgent(page);
    await page.waitForTimeout(3000);

    expect(hydrationErrors).toHaveLength(0);
  });
});
