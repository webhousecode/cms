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

// Surfaces to capture
const SURFACES: { name: string; path: string; waitMs?: number; fullPage?: boolean }[] = [
  { name: "admin-login",            path: "/admin/login" },
  { name: "admin-dashboard",        path: "/admin" },
  { name: "admin-collection-list",  path: "/admin/posts" },
  { name: "admin-document-editor",  path: "/admin/posts",          waitMs: 2000 }, // will click into first doc
  { name: "admin-settings",         path: "/admin/settings" },
  { name: "admin-sites",            path: "/admin/sites" },
  { name: "admin-new-site",         path: "/admin/sites/new" },
  { name: "admin-cockpit",          path: "/admin/agents" },
  { name: "admin-curation",         path: "/admin/curation" },
  { name: "admin-media",            path: "/admin/media" },
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

  // Auth context (with JWT cookie) — used for all pages except login
  const token = await createAuthToken();
  const authContext = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
  });
  await authContext.addCookies([
    { name: "cms-session", value: token, domain: "localhost", path: "/" },
  ]);

  // No-auth context for login page screenshot
  const noAuthContext = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
  });

  const results: string[] = [];

  for (const surface of SURFACES) {
    const isLogin = surface.name === "admin-login";
    const ctx = isLogin ? noAuthContext : authContext;
    const page = await ctx.newPage();

    try {
      log(`Capturing ${surface.name} → ${surface.path}`);

      // For the document editor, navigate to collection then click into first document
      if (surface.name === "admin-document-editor") {
        await page.goto(`${BASE_URL}/admin/posts`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);

        // Click the first document link in the list
        const docLink = page.locator('a[href*="/admin/posts/"]:not([href$="/new"])').first();
        if (await docLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await docLink.click();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(surface.waitMs ?? 1500);
        } else {
          log(`  No documents found in posts — capturing empty editor list instead`);
        }
      } else {
        await page.goto(`${BASE_URL}${surface.path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(surface.waitMs ?? 1500);
      }

      const outPath = path.join(OUT_DIR, `${surface.name}.png`);
      await page.screenshot({
        path: outPath,
        fullPage: surface.fullPage ?? false,
      });

      results.push(outPath);
      log(`  Saved ${surface.name}.png`);
    } catch (err) {
      log(`  FAILED ${surface.name}: ${err}`);
    } finally {
      await page.close();
    }
  }

  await authContext.close();
  await noAuthContext.close();
  await browser.close();

  log(`Done — ${results.length}/${SURFACES.length} screenshots saved to ${OUT_DIR}`);
  console.log("\nFiles:");
  for (const r of results) {
    console.log(`  ${path.basename(r)}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
