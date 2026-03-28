/**
 * F48 i18n — Collection list locale filter + translation workflows.
 *
 * Tests locale filter visibility, document filtering by language,
 * locale badges, and translation creation.
 *
 * @see docs/features/F48-i18n.md
 */
import { test as base, expect } from "../fixtures/auth";
import { seedDocument, deleteDocument } from "../fixtures/test-data";
import { SignJWT } from "jose";

// ── Custom fixture with Examples/Simple Blog org/site cookies ────

const JWT_SECRET =
  process.env.CMS_JWT_SECRET ??
  "b6ff0b5caa2ee4308470dfb3668b3835ef164174f87c176a41b8ea5e5b450dcd";

// Use "dev-token" sub which bypasses team lookup in require-role.ts
const test = base.extend({
  authedPage: async ({ page, context }, use) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      sub: "dev-token",
      email: "dev@localhost",
      name: "Dev Token",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
      { name: "cms-active-org", value: "examples", domain: "localhost", path: "/" },
      { name: "cms-active-site", value: "simple-blog", domain: "localhost", path: "/" },
    ]);

    await use(page);
  },
});

// ── Helpers ─────────────────────────────────────────────────────

async function createTestDoc(
  page: import("@playwright/test").Page,
  slug: string,
  data: Record<string, unknown>,
  locale?: string,
  translationOf?: string,
) {
  const body: Record<string, unknown> = { ...data, status: "published" };
  if (locale) body.locale = locale;
  if (translationOf) body.translationOf = translationOf;
  // POST to /api/cms/{collection} to create, then PATCH to set locale
  const createRes = await page.request.post(`/api/cms/posts`, { data: { slug, ...body } });
  if (locale || translationOf) {
    const patch: Record<string, unknown> = {};
    if (locale) patch.locale = locale;
    if (translationOf) patch.translationOf = translationOf;
    await page.request.patch(`/api/cms/posts/${slug}`, { data: patch });
  }
  return createRes;
}

async function deleteTestDoc(page: import("@playwright/test").Page, slug: string) {
  await page.request.delete(`/api/cms/posts/${slug}`).catch(() => {});
}

// ── Test Suite ──────────────────────────────────────────────────

test.describe("F48 i18n — Collection list locale filter", () => {
  // Test documents are pre-seeded:
  // - scenario-1-da (locale: da, source)
  // - scenario-1-en (locale: en, translationOf: scenario-1-da)
  // - scenario-2-da (locale: da, source)
  // - scenario-3-da (locale: da, source)

  // ── Locale filter visibility ────────────────────────────────

  test("locale filter buttons appear when site has multiple locales", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    // Should see locale filter buttons (site has da + en configured)
    await expect(page.getByRole("button", { name: "🇩🇰 DA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "🇬🇧 EN" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Source" })).toBeVisible();
  });

  // ── Locale badge on translated documents ────────────────────

  test("translated document shows locale badge and translationOf link", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    // The English translation should have an EN badge
    const enRow = page.locator("tr", { hasText: "Scenario 1 — English translation" });
    await expect(enRow).toBeVisible();
    // Locale badge is a <span> with exact "EN" text
    await expect(enRow.locator("span", { hasText: /^EN$/ })).toBeVisible();

    // Should show translationOf link (→ scenario-1-da)
    await expect(enRow.locator("text=→ scenario-1-da")).toBeVisible();
  });

  test("source document shows DA locale badge", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    const daRow = page.locator("tr", { hasText: "Scenario 1 — Dansk kildeside" });
    await expect(daRow).toBeVisible();
    // Locale badge is a <span> with exact "DA" text
    await expect(daRow.locator("span", { hasText: /^DA$/ })).toBeVisible();
  });

  // ── Filter by locale ────────────────────────────────────────

  test("DA filter shows only Danish documents", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    // Click DA filter
    await page.getByRole("button", { name: "🇩🇰 DA" }).last().click();
    await page.waitForTimeout(500);

    // English translation should be hidden
    await expect(page.locator("tr", { hasText: "Scenario 1 — English translation" })).not.toBeVisible();

    // Danish source should still be visible
    await expect(page.locator("tr", { hasText: "Scenario 1 — Dansk kildeside" })).toBeVisible();
  });

  test("EN filter shows only English translations", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    // Click EN filter
    await page.getByRole("button", { name: "🇬🇧 EN" }).last().click();
    await page.waitForTimeout(500);

    // English translation should be visible
    await expect(page.locator("tr", { hasText: "Scenario 1 — English translation" })).toBeVisible();

    // Danish sources should be hidden
    await expect(page.locator("tr", { hasText: "Scenario 1 — Dansk kildeside" })).not.toBeVisible();
  });

  test("Source filter hides translations", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    // Click Source filter
    await page.getByRole("button", { name: "Source" }).click();
    await page.waitForTimeout(500);

    // Translations (docs with translationOf) should be hidden
    await expect(page.locator("tr", { hasText: "Scenario 1 — English translation" })).not.toBeVisible();

    // Source docs should still be visible
    await expect(page.locator("tr", { hasText: "Scenario 1 — Dansk kildeside" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Scenario 2" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Scenario 3" })).toBeVisible();
  });

  test("All filter shows all documents including translations", async ({ authedPage: page }) => {
    await page.goto("/admin/posts");
    await page.waitForTimeout(3000);

    // Click EN first to filter, then All to reset
    await page.getByRole("button", { name: "🇬🇧 EN" }).last().click();
    await page.waitForTimeout(300);
    // Now click All (the locale All, not the status All)
    const allButtons = page.getByRole("button", { name: "All" });
    await allButtons.last().click();
    await page.waitForTimeout(500);

    // Both should be visible
    await expect(page.locator("tr", { hasText: "Scenario 1 — Dansk kildeside" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Scenario 1 — English translation" })).toBeVisible();
  });
});

// ── Settings page locale config ───────────────────────────────

test.describe("F48 i18n — Settings page language config", () => {
  test.skip("language section shows configured locales", async ({ authedPage: page }) => {
    // Navigate to settings and wait for Site Settings to load
    await page.goto("/admin/settings");
    await page.waitForTimeout(3000);

    // Click Site Settings in sidebar if not already active
    const siteSettingsLink = page.locator("a", { hasText: "Site Settings" });
    if (await siteSettingsLink.isVisible()) {
      await siteSettingsLink.click();
      await page.waitForTimeout(2000);
    }

    // Scroll down to Language section
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("*")).find(
        (e) => e.textContent?.trim() === "Default language" && e.tagName !== "SCRIPT"
      );
      el?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(500);

    // Should show default language selector with Dansk
    await expect(page.locator("text=Dansk (da)").first()).toBeVisible({ timeout: 10000 });

    // Should show supported languages
    await expect(page.locator("text=Supported languages").first()).toBeVisible();
  });
});
