/**
 * UI Screenshot Agent
 *
 * Captures screenshots of the CMS admin UI at localhost:3010.
 * Uses Playwright (chromium) with JWT cookie injection for auth.
 *
 * Usage:
 *   pnpm screenshots
 *
 * Prerequisites:
 *   - CMS admin dev server running: cd packages/cms-admin && pnpm dev
 *   - Playwright chromium installed: pnpm --filter @webhouse/cms-admin exec playwright install chromium
 */

import { chromium } from "playwright";
import { SignJWT } from "jose";
import path from "path";
import fs from "fs";

/* ─── Config ─────────────────────────────────────────────────── */

const BASE_URL = "http://localhost:3010";
const OUT_DIR = path.resolve(import.meta.dirname ?? __dirname, "../docs/screenshots");
const VIEWPORT = { width: 1440, height: 900 };
const JWT_SECRET = "b6ff0b5caa2ee4308470dfb3668b3835ef164174f87c176a41b8ea5e5b450dcd";

// Static surfaces — always captured
const STATIC_SURFACES: { name: string; sidebarClick?: string; path?: string }[] = [
  { name: "login",           path: "/admin/login" },
  { name: "dashboard" },
  { name: "settings",        sidebarClick: "Site Settings" },
  { name: "sites",           sidebarClick: "Sites" },
  { name: "new-site",        path: "/admin/sites/new" },
  { name: "cockpit",         sidebarClick: "Cockpit" },
  { name: "curation",        sidebarClick: "Curation Queue" },
  { name: "media",           sidebarClick: "Media" },
];

/* ─── Helpers ────────────────────────────────────────────────── */

async function createAuthToken(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ sub: "screenshot-agent", email: "admin@webhouse.app", name: "Screenshot Agent" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/* ─── Main ───────────────────────────────────────────────────── */

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Check if the dev server is reachable
  try {
    const res = await fetch(`${BASE_URL}/admin/login`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`Cannot reach ${BASE_URL} — is the CMS admin dev server running?`);
    console.error("  Start it with: cd packages/cms-admin && pnpm dev");
    process.exit(1);
  }

  log("Launching browser...");
  const browser = await chromium.launch({ headless: true });

  const token = await createAuthToken();
  const authContext = await browser.newContext({ viewport: VIEWPORT, colorScheme: "dark" });
  await authContext.addCookies([
    { name: "cms-session", value: token, domain: "localhost", path: "/" },
  ]);
  const noAuthContext = await browser.newContext({ viewport: VIEWPORT, colorScheme: "dark" });

  const results: string[] = [];

  async function capture(name: string, page: import("playwright").Page) {
    const outPath = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: outPath });
    results.push(outPath);
    log(`  Saved ${name}.png`);
  }

  async function clickSidebar(page: import("playwright").Page, text: string): Promise<boolean> {
    const link = page.locator(`[data-sidebar] a, nav a, aside a`).filter({ hasText: text }).first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(2000);
      return true;
    }
    return false;
  }

  // ── Login (no auth) ──
  log("Capturing login");
  const loginPage = await noAuthContext.newPage();
  await loginPage.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" });
  await loginPage.waitForTimeout(1000);
  await capture("login", loginPage);
  await loginPage.close();

  // ── All other pages use one persistent page (preserves client-side state) ──
  const page = await authContext.newPage();
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Dashboard
  log("Capturing dashboard");
  await capture("dashboard", page);

  // Static sidebar pages
  for (const surface of STATIC_SURFACES.filter(s => s.sidebarClick)) {
    log(`Capturing ${surface.name} (sidebar: ${surface.sidebarClick})`);
    if (await clickSidebar(page, surface.sidebarClick!)) {
      await capture(surface.name, page);
    } else {
      log(`  SKIP — sidebar link "${surface.sidebarClick}" not found`);
    }
    // Go back to dashboard for clean state
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
  }

  // New site (direct URL — it's a dedicated route)
  log("Capturing new-site");
  await page.goto(`${BASE_URL}/admin/sites/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await capture("new-site", page);

  // ── Dynamic: discover collections from sidebar ──
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Find collection links in sidebar under "Content"
  const collectionLinks = page.locator('[data-sidebar] a[href*="/admin/"]').filter({ hasNotText: /Dashboard|Cockpit|Agents|Curation|Media|Link|Performance|Settings|Sites|Trash/i });
  const count = await collectionLinks.count();

  for (let i = 0; i < count; i++) {
    const link = collectionLinks.nth(i);
    const text = (await link.textContent())?.trim();
    if (!text) continue;
    const slug = text.toLowerCase().replace(/\s+/g, "-");

    // Collection list
    log(`Capturing collection: ${text}`);
    await link.click();
    await page.waitForTimeout(2000);
    await capture(`collection-${slug}`, page);

    // Try clicking into first document for editor screenshot
    const docRow = page.locator('tbody tr').first();
    if (await docRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      await docRow.click();
      await page.waitForTimeout(2000);
      await capture(`editor-${slug}`, page);
    }

    // Back to dashboard
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
  }

  await page.close();
  await authContext.close();
  await noAuthContext.close();
  await browser.close();

  log(`Done — ${results.length} screenshots saved to ${OUT_DIR}`);
  console.log("\nFiles:");
  for (const r of results) {
    console.log(`  ${path.basename(r)}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
