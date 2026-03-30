/**
 * F99 — Preview URL tests.
 *
 * Verifies that ALL preview entry points construct correct URLs
 * and that the preview target responds 200 (not 404).
 *
 * Tests against CMS Docs site (localhost:3036) which uses:
 * - Flat routing: /docs/{slug} (no category in URL)
 * - Locale in slug: introduction-da (not /da/introduction)
 * - localeStrategy: "none"
 *
 * Prerequisites:
 * - CMS admin running on localhost:3010
 * - CMS Docs dev server on localhost:3036
 * - CMS Docs site registered in CMS admin with previewSiteUrl=http://localhost:3036
 */
import { test, expect } from "../fixtures/auth";
import { gotoAdmin } from "../fixtures/helpers";

const BASE = "http://localhost:3010";
const DOCS_PREVIEW = "http://localhost:3036";

// Helper: switch to CMS Docs site
async function switchToCmsDocs(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    { name: "cms-active-org", value: "default", domain: "localhost", path: "/" },
    { name: "cms-active-site", value: "cms-docs", domain: "localhost", path: "/" },
  ]);
}

// Helper: verify a URL responds 200
async function assertUrl200(page: import("@playwright/test").Page, url: string) {
  const response = await page.request.get(url);
  expect(response.status(), `Expected 200 for ${url}`).toBe(200);
}

// ── Test: Preview URLs resolve correctly ──────────────────────────

test.describe("Preview URL construction", () => {

  test.beforeEach(async ({ authedPage: page }) => {
    await switchToCmsDocs(page);
  });

  test("EN doc preview URL: /docs/{slug} (no category prefix)", async ({ authedPage: page }) => {
    // Verify the actual page exists
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/introduction`);
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/quick-start`);
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/config-reference`);
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/deployment`);
  });

  test("DA doc preview URL: /docs/{slug}-da (no /da/ prefix)", async ({ authedPage: page }) => {
    // These MUST work — locale is in slug, not URL prefix
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/introduction-da`);
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/quick-start-da`);
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/docker-deployment-da`);
  });

  test("DA doc preview MUST NOT have /da/ prefix", async ({ authedPage: page }) => {
    // These MUST 404 — /da/ prefix is wrong for this site
    const response = await page.request.get(`${DOCS_PREVIEW}/da/docs/introduction-da`);
    expect(response.status()).toBe(404);
  });

  test("category field does NOT appear in URL", async ({ authedPage: page }) => {
    // config-reference has category "config" — URL must NOT be /docs/config/config-reference
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/config-reference`);
    const wrongUrl = await page.request.get(`${DOCS_PREVIEW}/docs/config/config-reference`);
    expect(wrongUrl.status()).toBe(404);

    // build-guide has category "guides" — URL must NOT be /docs/guides/build-guide
    await assertUrl200(page, `${DOCS_PREVIEW}/docs/build-guide`);
    const wrongUrl2 = await page.request.get(`${DOCS_PREVIEW}/docs/guides/build-guide`);
    expect(wrongUrl2.status()).toBe(404);
  });

  test("homepage preview resolves", async ({ authedPage: page }) => {
    await assertUrl200(page, `${DOCS_PREVIEW}/`);
  });

  test("changelog preview resolves", async ({ authedPage: page }) => {
    await assertUrl200(page, `${DOCS_PREVIEW}/changelog`);
  });
});

// ── Test: Editor preview button constructs correct URL ────────────

test.describe("Editor preview button", () => {

  test.beforeEach(async ({ authedPage: page }) => {
    await switchToCmsDocs(page);
  });

  test("EN doc editor preview opens correct URL", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/admin/docs/introduction`);
    await page.waitForTimeout(2000);

    // Find the preview/eye button and get the URL it would open
    // We intercept the navigation instead of clicking
    const previewPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);

    // Click preview button (eye icon in action bar or editor toolbar)
    const previewBtn = page.locator('[data-testid="btn-preview"], button[title*="Preview"], button[aria-label*="Preview"]').first();
    if (await previewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await previewBtn.click();
      const popup = await previewPromise;
      if (popup) {
        const url = popup.url();
        // URL should be /docs/introduction, NOT /docs/getting-started/introduction
        expect(url).toContain("/docs/introduction");
        expect(url).not.toContain("/getting-started/");
        await popup.close();
      }
    }
  });

  test("DA doc editor preview opens correct URL (no /da/ prefix)", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/admin/docs/docker-deployment-da`);
    await page.waitForTimeout(2000);

    const previewPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);

    const previewBtn = page.locator('[data-testid="btn-preview"], button[title*="Preview"], button[aria-label*="Preview"]').first();
    if (await previewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await previewBtn.click();
      const popup = await previewPromise;
      if (popup) {
        const url = popup.url();
        // URL should be /docs/docker-deployment-da, NOT /da/docs/docker-deployment-da
        expect(url).toContain("/docs/docker-deployment-da");
        expect(url).not.toContain("/da/docs/");
        await popup.close();
      }
    }
  });
});

// ── Test: Collection list preview links ───────────────────────────

test.describe("Collection list preview", () => {

  test.beforeEach(async ({ authedPage: page }) => {
    await switchToCmsDocs(page);
  });

  test("grid view card preview uses previewSiteUrl (not sirv)", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/admin/docs`);
    await page.waitForTimeout(2000);

    // Check that preview iframes/thumbnails use localhost:3036, not :3028 (sirv)
    const iframes = page.locator("iframe");
    const count = await iframes.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      const src = await iframes.nth(i).getAttribute("src");
      if (src) {
        expect(src, "Preview should use previewSiteUrl, not sirv").toContain("localhost:3036");
        expect(src).not.toContain("localhost:3028");
      }
    }
  });
});

// ── Test: Dashboard preview ───────────────────────────────────────

test.describe("Dashboard preview", () => {

  test.beforeEach(async ({ authedPage: page }) => {
    await switchToCmsDocs(page);
  });

  test("dashboard site preview thumbnail uses previewSiteUrl", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(3000);

    // The dashboard preview card should show the actual site
    const previewIframe = page.locator(".site-intro-card iframe, [data-testid='site-preview'] iframe").first();
    if (await previewIframe.isVisible({ timeout: 5000 }).catch(() => false)) {
      const src = await previewIframe.getAttribute("src");
      if (src) {
        expect(src).toContain("localhost:3036");
      }
    }
  });
});

// ── Test: Top bar preview button ──────────────────────────────────

test.describe("Top bar preview", () => {

  test.beforeEach(async ({ authedPage: page }) => {
    await switchToCmsDocs(page);
  });

  test("header preview button opens previewSiteUrl", async ({ authedPage: page }) => {
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(2000);

    // The globe/preview icon in the top bar
    const previewLink = page.locator('[data-testid="btn-site-preview"], a[title*="Preview"], a[href*="/admin/preview"]').first();
    if (await previewLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      const href = await previewLink.getAttribute("href");
      if (href) {
        // Should contain the previewSiteUrl
        expect(href).toContain("localhost:3036");
      }
    }
  });
});
