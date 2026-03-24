import { test, expect, Page } from "playwright/test";

const BASE_URL = "http://localhost:3010";
const EMAIL = "cb@webhouse.dk";
const PASSWORD = "***REMOVED-PASSWORD***";

/**
 * Registry data for verification:
 *
 * org: webhouse (WebHouse)     → sites: webhouse-site (WebHouse 2026), landing, sproutlake, meridian-studio, elina-voss-portfolio, freelancer, boutique
 * org: aallm (AALLM)          → sites: portfolio (Elena Vasquez), blog (Thinking in Pixels)
 * org: christian-broberg       → sites: bridgeberg (Bridgeberg)
 *
 * Default: org=webhouse, site=webhouse-site
 */

async function login(page: Page) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded" });
  // Wait for page to settle
  await page.waitForTimeout(3000);
  // If already logged in (redirected to admin), we're done
  if (!page.url().includes("/admin/login")) return;
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin**", { timeout: 15000 });
  await page.waitForTimeout(3000);
}

/** Wait for org switcher to be visible (indicates header is rendered) */
async function waitForHeader(page: Page) {
  await page.locator("button").filter({ has: page.locator("svg.lucide-building-2") }).first().waitFor({ state: "visible", timeout: 15000 });
}

/** Get org name from the org switcher button */
async function getOrgName(page: Page): Promise<string> {
  const orgTrigger = page.locator("button").filter({ has: page.locator("svg.lucide-building-2") }).first();
  return (await orgTrigger.textContent())?.trim() ?? "";
}

/** Switch to a different org by clicking its name in the dropdown */
async function switchOrg(page: Page, orgName: string) {
  const orgTrigger = page.locator("button").filter({ has: page.locator("svg.lucide-building-2") }).first();
  await orgTrigger.click();
  await page.waitForTimeout(500);
  await page.getByRole("menuitem", { name: orgName }).click();
  // OrgSwitcher does window.location.href — wait for full page load
  await page.waitForLoadState("load", { timeout: 15000 });
  await waitForHeader(page);
  await page.waitForTimeout(1500);
}

test.describe("Org & Site Switching", () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("switching org loads the default site for that org — full UI verification", async ({ page }) => {
    // Step 1: Start at WebHouse org, ensure clean state
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await waitForHeader(page);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "tests/screenshots/01-initial-state.png", fullPage: true });

    const initialOrg = await getOrgName(page);
    console.log("[initial] org:", initialOrg);

    // If not on WebHouse, switch to it first
    if (!initialOrg.includes("WebHouse")) {
      await switchOrg(page, "WebHouse");
    }

    // ─── Switch to AALLM ────────────────────────────
    console.log("[action] Switching to AALLM org...");
    await switchOrg(page, "AALLM");
    await page.screenshot({ path: "tests/screenshots/02-after-switch-to-aallm.png", fullPage: true });

    // Verify org switcher shows AALLM
    const orgAfterSwitch = await getOrgName(page);
    console.log("[after switch] org:", orgAfterSwitch);
    expect(orgAfterSwitch).toContain("AALLM");

    // Page must NOT show content from old org (Freelancer / Sarah Mitchell / WebHouse sites)
    const mainContent = await page.locator("main").first().textContent() ?? "";
    console.log("[after switch] main content:", mainContent.substring(0, 200));

    expect(mainContent).not.toContain("Freelancer");
    expect(mainContent).not.toContain("Sarah Mitchell");
    expect(mainContent).not.toContain("cbroberg.github.io/freelancer-site");

    // If on sites page (AALLM has 2 sites), verify correct sites shown
    if (page.url().includes("/admin/sites")) {
      const hasAallmSites = mainContent.includes("Elena Vasquez") || mainContent.includes("Thinking in Pixels");
      expect(hasAallmSites).toBe(true);

      // Must NOT show WebHouse sites
      expect(mainContent).not.toContain("SproutLake");
      expect(mainContent).not.toContain("WebHouse 2026");
      expect(mainContent).not.toContain("Meridian Studio");
    }

    // If on dashboard, verify content is from AALLM default site (Elena Vasquez)
    if (page.url().match(/\/admin\/?$/)) {
      expect(mainContent).not.toContain("Freelancer");
    }

    // Verify site switcher shows AALLM sites
    const siteSwitcher = page.locator("button").filter({ hasText: /Elena Vasquez|Thinking in Pixels/ }).first();
    if (await siteSwitcher.isVisible({ timeout: 3000 }).catch(() => false)) {
      await siteSwitcher.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "tests/screenshots/03-aallm-site-dropdown.png" });

      const siteItems = page.getByRole("menuitem");
      const siteNames: string[] = [];
      for (let i = 0; i < await siteItems.count(); i++) {
        const text = await siteItems.nth(i).textContent();
        if (text) siteNames.push(text.trim());
      }
      console.log("[site dropdown] sites:", siteNames);
      expect(siteNames.some(n => n.includes("Elena Vasquez"))).toBe(true);
      expect(siteNames.some(n => n.includes("Thinking in Pixels"))).toBe(true);
      expect(siteNames.some(n => n.includes("Freelancer"))).toBe(false);
      expect(siteNames.some(n => n.includes("SproutLake"))).toBe(false);

      await page.keyboard.press("Escape");
    }

    // ─── Switch back to WebHouse ────────────────────
    console.log("[action] Switching back to WebHouse...");
    await switchOrg(page, "WebHouse");
    await page.screenshot({ path: "tests/screenshots/04-after-switch-back-to-webhouse.png", fullPage: true });

    const orgBack = await getOrgName(page);
    console.log("[after switch back] org:", orgBack);
    expect(orgBack).toContain("WebHouse");

    const dashAfterBack = await page.locator("main").first().textContent() ?? "";
    expect(dashAfterBack).not.toContain("Elena Vasquez");
    expect(dashAfterBack).not.toContain("Thinking in Pixels");

    // ─── Switch to Christian Broberg (single site) ──
    console.log("[action] Switching to Christian Broberg...");
    await switchOrg(page, "Christian Broberg");
    await page.screenshot({ path: "tests/screenshots/05-after-switch-to-cb.png", fullPage: true });

    const orgCb = await getOrgName(page);
    console.log("[after switch to CB] org:", orgCb);
    expect(orgCb).toContain("Christian Broberg");

    // Single-site org goes to /admin (not /admin/sites)
    expect(page.url()).toMatch(/\/admin\/?$/);

    // Content must be Bridgeberg, not from other orgs
    const dashCb = await page.locator("main").first().textContent() ?? "";
    expect(dashCb).not.toContain("Freelancer");
    expect(dashCb).not.toContain("Elena Vasquez");
    expect(dashCb).not.toContain("Sarah Mitchell");

    console.log("[PASS] All org switches verified — content always matches active org's default site");
  });

  test("switching site within an org loads the correct site content", async ({ page }) => {
    // Switch to AALLM (has 2 sites)
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await waitForHeader(page);
    await page.waitForTimeout(1000);

    await switchOrg(page, "AALLM");

    // If on sites page, click Elena Vasquez to activate it
    if (page.url().includes("/admin/sites")) {
      const siteLink = page.locator("a, button").filter({ hasText: "Elena Vasquez" }).first();
      if (await siteLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await siteLink.click();
        await page.waitForLoadState("load");
        await waitForHeader(page);
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: "tests/screenshots/10-aallm-elena-dashboard.png", fullPage: true });

    // Now switch to Thinking in Pixels via site switcher
    const siteSwitcher = page.locator("button").filter({ hasText: /Elena Vasquez|Thinking in Pixels/ }).first();
    if (await siteSwitcher.isVisible({ timeout: 5000 }).catch(() => false)) {
      await siteSwitcher.click();
      await page.waitForTimeout(500);

      const thinkingItem = page.getByRole("menuitem", { name: "Thinking in Pixels" });
      if (await thinkingItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await thinkingItem.click();
        // SiteSwitcher uses window.location.href — hard reload
        await page.waitForLoadState("load", { timeout: 15000 });
        await waitForHeader(page);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "tests/screenshots/11-aallm-thinking-dashboard.png", fullPage: true });

        // Verify org is still AALLM
        const orgName = await getOrgName(page);
        expect(orgName).toContain("AALLM");

        console.log("[PASS] Site switch within AALLM org verified");
      }
    }
  });
});
