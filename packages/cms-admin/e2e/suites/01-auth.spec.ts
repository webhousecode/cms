/**
 * F99 — Auth, login, landing page, RBAC, and smoke tests.
 *
 * Merged from: console-errors.spec.ts, landing-page.spec.ts, login-flow.spec.ts, viewer-rbac.spec.ts
 * @see docs/features/F99-e2e-testing-suite.md
 */
import { test, expect } from "../fixtures/auth";
import { collectConsoleErrors, collect404s, gotoAdmin } from "../fixtures/helpers";

// ── Smoke: no console errors on key pages ────────────────────────

test.describe("Smoke: no critical console errors", () => {
  test("agents + curation pages load without errors", async ({ authedPage: page }) => {
    const errors = collectConsoleErrors(page);
    const failed = collect404s(page);

    await gotoAdmin(page, "/agents");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click into first agent if available
    const agentLink = page.locator('a[href*="/admin/agents/"]:not([href$="/new"])').first();
    if (await agentLink.isVisible()) {
      await agentLink.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
    }

    // Visit curation
    await gotoAdmin(page, "/curation");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });
});

// ── Landing page ─────────────────────────────────────────────────

test.describe("Landing page", () => {
  test("root serves content with correct title", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    const title = await page.title();
    expect(title).toMatch(/webhouse\.app/i);
  });

  test("/admin/login is accessible", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.status()).toBe(200);
  });
});

// ── Login flow ───────────────────────────────────────────────────

test.describe("Login flow", () => {
  test("dashboard loads when authenticated via JWT", async ({ authedPage: page }) => {
    await gotoAdmin(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should be on /admin, not redirected to login
    expect(page.url()).toContain("/admin");
    expect(page.url()).not.toContain("/admin/login");
  });
});

// ── Viewer RBAC ──────────────────────────────────────────────────

import { test as base } from "@playwright/test";
import { SignJWT } from "jose";

const JWT_SECRET =
  process.env.CMS_JWT_SECRET ??
  process.env.JWT_SECRET ??
  "***REMOVED-JWT-SECRET***";

const viewerTest = base.extend<{ viewerPage: import("@playwright/test").Page }>({
  viewerPage: async ({ page, context }, use) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      sub: "viewer-test",
      email: "viewer@test.com",
      name: "Test Viewer",
      role: "viewer",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
      { name: "cms-active-org", value: "default", domain: "localhost", path: "/" },
      { name: "cms-active-site", value: "default", domain: "localhost", path: "/" },
    ]);

    await use(page);
  },
});

viewerTest.describe("Viewer RBAC", () => {
  viewerTest("sidebar hides Settings for viewer", async ({ viewerPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const settingsLink = page.locator('a[href="/admin/settings"]');
    await expect(settingsLink).toHaveCount(0);
  });

  viewerTest("collection list hides New/Generate buttons", async ({ viewerPage: page }) => {
    await page.goto("/admin/pages", { timeout: 15000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2500);
    const newButton = page.locator('button:has-text("New")');
    await expect(newButton).toHaveCount(0);
    const generateButton = page.locator('button:has-text("Generate")');
    await expect(generateButton).toHaveCount(0);
  });

  viewerTest("document editor is read-only for viewer", async ({ viewerPage: page }) => {
    await page.goto("/admin/pages");
    await page.waitForLoadState("networkidle");
    const firstDoc = page.locator('a[href^="/admin/pages/"]').first();
    if ((await firstDoc.count()) === 0) {
      viewerTest.skip();
      return;
    }
    await firstDoc.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const readOnlyBadge = page.locator("text=Read only");
    await expect(readOnlyBadge).toBeVisible();

    const saveButton = page.locator('button:has-text("Save")');
    await expect(saveButton).toHaveCount(0);
  });

  viewerTest("API rejects write operations for viewer", async ({ viewerPage: page }) => {
    await page.goto("/admin");
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/cms/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "rbac-test", data: { title: "Should fail" } }),
      });
      return res.status;
    });
    expect([401, 403, 500]).toContain(status);
  });
});
