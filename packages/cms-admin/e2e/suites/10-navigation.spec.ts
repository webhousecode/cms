/**
 * F99 — Navigation, tabs, site/org switcher tests.
 *
 * Merged from: tab-isolation.spec.ts, org-site-switch.spec.ts
 * @see docs/features/F99-e2e-testing-suite.md
 */
import { test, expect } from "../fixtures/auth";
import { gotoAdmin, getTabTitles } from "../fixtures/helpers";

// ── Tab navigation ───────────────────────────────────────────────

test.describe("Tab navigation", () => {
  test("dashboard loads with at least one tab", async ({ authedPage: page }) => {
    await gotoAdmin(page);
    await page.waitForLoadState("networkidle");

    const tabBar = page.locator('[class*="tab"]').first();
    await expect(tabBar).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to media shows Media content", async ({ authedPage: page }) => {
    await gotoAdmin(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await gotoAdmin(page, "/media");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.locator("text=Media")).toBeVisible({ timeout: 5000 });
  });

  test("browser title includes site name", async ({ authedPage: page }) => {
    await gotoAdmin(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const title = await page.title();
    expect(title).toContain("webhouse.app");
  });
});

// ── Sidebar ──────────────────────────────────────────────────────

test.describe("Sidebar", () => {
  test("Tools group exists with link checker, backup, performance", async ({
    authedPage: page,
  }) => {
    await gotoAdmin(page);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Tools")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Link Checker")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Backup")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Performance")).toBeVisible({ timeout: 5000 });
  });
});

// ── Backup page ──────────────────────────────────────────────────

test.describe("Backup page", () => {
  test("backup page loads with Create Backup button", async ({ authedPage: page }) => {
    await gotoAdmin(page, "/backup");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Backup & Restore")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Create Backup")).toBeVisible({ timeout: 5000 });
  });
});

// ── Calendar ─────────────────────────────────────────────────────

test.describe("Calendar", () => {
  test("calendar page loads with event type legend", async ({ authedPage: page }) => {
    await gotoAdmin(page, "/scheduled");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Calendar").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Publish")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Expiry")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Backup")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Link Check")).toBeVisible({ timeout: 5000 });
  });
});

// ── Site Settings ────────────────────────────────────────────────

test.describe("Site Settings", () => {
  test("tools tab exists in site settings", async ({ authedPage: page }) => {
    await gotoAdmin(page, "/settings?tab=tools");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Backup Schedule")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Link Checker Schedule")).toBeVisible({ timeout: 5000 });
  });
});

// ── Org & Site Switching ─────────────────────────────────────────
// NOTE: These tests require a multi-org/multi-site setup with real login.
// They use credential-based login because org/site switching does full page reloads.
// Skipped by default in CI — run locally with: npx playwright test --grep "Org"

import { test as base } from "@playwright/test";

const BASE_URL = "http://localhost:3010";
const EMAIL = "cb@webhouse.dk";
const PASSWORD = "***REMOVED-PASSWORD***";

async function loginWithCredentials(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  if (!page.url().includes("/admin/login")) return;
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin**", { timeout: 15000 });
  await page.waitForTimeout(3000);
}

async function waitForHeader(page: import("@playwright/test").Page) {
  await page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-building-2") })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

async function getOrgName(page: import("@playwright/test").Page): Promise<string> {
  const orgTrigger = page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-building-2") })
    .first();
  return (await orgTrigger.textContent())?.trim() ?? "";
}

async function switchOrg(page: import("@playwright/test").Page, orgName: string) {
  const orgTrigger = page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-building-2") })
    .first();
  await orgTrigger.click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: orgName }).click();
  await page.waitForLoadState("load", { timeout: 15000 });
  await waitForHeader(page);
  await page.waitForTimeout(1500);
}

base.describe("Org & Site Switching", () => {
  base.setTimeout(90000);

  base.beforeEach(async ({ page }) => {
    await loginWithCredentials(page);
  });

  base("switching org loads the default site for that org", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await waitForHeader(page);
    await page.waitForTimeout(2000);

    const initialOrg = await getOrgName(page);
    if (!initialOrg.includes("WebHouse")) {
      await switchOrg(page, "WebHouse");
    }

    // Switch to AALLM
    await switchOrg(page, "AALLM");
    const orgAfterSwitch = await getOrgName(page);
    expect(orgAfterSwitch).toContain("AALLM");

    const mainContent = (await page.locator("main").first().textContent()) ?? "";
    expect(mainContent).not.toContain("Freelancer");
    expect(mainContent).not.toContain("Sarah Mitchell");

    // Switch back to WebHouse
    await switchOrg(page, "WebHouse");
    const orgBack = await getOrgName(page);
    expect(orgBack).toContain("WebHouse");

    // Switch to Christian Broberg (single site)
    await switchOrg(page, "Christian Broberg");
    const orgCb = await getOrgName(page);
    expect(orgCb).toContain("Christian Broberg");
    expect(page.url()).toMatch(/\/admin\/?$/);
  });

  base("switching site within an org loads correct content", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await waitForHeader(page);
    await page.waitForTimeout(1000);

    await switchOrg(page, "AALLM");

    if (page.url().includes("/admin/sites")) {
      const siteLink = page
        .locator("a, button")
        .filter({ hasText: "Elena Vasquez" })
        .first();
      if (await siteLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await siteLink.click();
        await page.waitForLoadState("load");
        await waitForHeader(page);
        await page.waitForTimeout(2000);
      }
    }

    // Switch to Thinking in Pixels via site switcher
    const siteSwitcher = page
      .locator("button")
      .filter({ hasText: /Elena Vasquez|Thinking in Pixels/ })
      .first();
    if (await siteSwitcher.isVisible({ timeout: 5000 }).catch(() => false)) {
      await siteSwitcher.click();
      await page.waitForTimeout(500);

      const thinkingItem = page.getByRole("menuitem", { name: "Thinking in Pixels" });
      if (await thinkingItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await thinkingItem.click();
        await page.waitForLoadState("load", { timeout: 15000 });
        await waitForHeader(page);
        await page.waitForTimeout(2000);

        const orgName = await getOrgName(page);
        expect(orgName).toContain("AALLM");
      }
    }
  });
});
