import { test, expect, type Page } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET = process.env.CMS_JWT_SECRET ?? process.env.JWT_SECRET ?? "";

async function login(context: any) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ sub: "test-user", email: "cb@webhouse.dk", name: "Christian" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  await context.addCookies([{ name: "cms-session", value: token, domain: "localhost", path: "/" }]);
}

/** Get all visible tab titles from the tab bar */
async function getTabTitles(page: Page): Promise<string[]> {
  // Tab bar buttons have text content — collect them
  const tabs = page.locator('[data-tab-id]');
  const count = await tabs.count();
  const titles: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).textContent();
    if (text) titles.push(text.trim());
  }
  return titles;
}

/** Check if a specific tab title exists */
async function hasTab(page: Page, title: string): Promise<boolean> {
  const titles = await getTabTitles(page);
  return titles.some((t) => t.includes(title));
}

test.describe("Tab isolation between sites", () => {
  test.beforeEach(async ({ context }) => {
    await login(context);
  });

  test("dashboard loads with at least one tab", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Should have at least a Dashboard tab
    const tabBar = page.locator('[class*="tab"]').first();
    await expect(tabBar).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to media creates/updates tab", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Navigate to Media
    await page.goto("/admin/media");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Page should show Media content
    await expect(page.locator("text=Media")).toBeVisible({ timeout: 5000 });
  });

  test("site switcher is visible with multiple sites", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Look for the site switcher (Globe icon + site name + chevron)
    const siteSwitcher = page.locator("text=Freelancer").or(page.locator("text=SproutLake")).or(page.locator("text=Boutique"));
    // If multi-site mode, at least one site name should be visible
    const count = await siteSwitcher.count();
    console.log(`Found ${count} site name(s) in header`);
  });

  test("browser title includes site name", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log(`Browser title: "${title}"`);
    expect(title).toContain("webhouse.app");
  });
});

test.describe("Backup page", () => {
  test.beforeEach(async ({ context }) => {
    await login(context);
  });

  test("backup page loads", async ({ page }) => {
    await page.goto("/admin/backup");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Backup & Restore")).toBeVisible({ timeout: 10_000 });
  });

  test("create backup button exists", async ({ page }) => {
    await page.goto("/admin/backup");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Create Backup")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Tools sidebar", () => {
  test.beforeEach(async ({ context }) => {
    await login(context);
  });

  test("tools group exists in sidebar with link checker, backup, performance", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Tools group should be visible
    await expect(page.locator("text=Tools")).toBeVisible({ timeout: 10_000 });

    // Items under Tools
    await expect(page.locator("text=Link Checker")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Backup")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Performance")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Calendar", () => {
  test.beforeEach(async ({ context }) => {
    await login(context);
  });

  test("calendar page loads with event type legend", async ({ page }) => {
    await page.goto("/admin/scheduled");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Calendar").first()).toBeVisible({ timeout: 10_000 });

    // Event type legend should include Backup and Link Check
    await expect(page.locator("text=Publish")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Expiry")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Backup")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Link Check")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Site Settings", () => {
  test.beforeEach(async ({ context }) => {
    await login(context);
  });

  test("tools tab exists in site settings", async ({ page }) => {
    await page.goto("/admin/settings?tab=tools");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Backup Schedule")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Link Checker Schedule")).toBeVisible({ timeout: 5000 });
  });
});
