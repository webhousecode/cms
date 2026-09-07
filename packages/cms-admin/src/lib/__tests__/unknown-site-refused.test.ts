import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve from THIS FILE, never from process.cwd().
 *
 * cwd is whatever directory vitest was invoked from, so the same test is
 * green run one way and errors out run another — and a file that cannot be
 * read fails BEFORE a single assertion, which reports as a red test rather
 * than as a broken harness. Measured 7 Sep 2026: a mutation check on this
 * suite reported "RED with the mutation" for two mutations that changed
 * nothing, because the baseline was already red for this reason. A mutation
 * check whose baseline is red measures the harness, not the code.
 */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * F157.18 — an unresolvable `?site=` must be REFUSED, not silently ignored.
 *
 * proxy.ts used to no-op when `?site=` named a site the registry does not have,
 * on the written assumption that "handlers will then return their normal 'site
 * not found' error". Two handlers do not: they read the tenant ambiently,
 * getActiveSiteEntry() falls back to registry.defaultSiteId, and the caller gets
 * 200 for a DIFFERENT tenant than the one they named.
 *
 * Measured against production, 7 September 2026:
 *
 *   POST /api/inline-edit/token?site=findes-ikke-xyz  → 200, token for webhouse-site
 *   POST /api/admin/site-config?site=findes-ikke-xyz  → 200, webhouse-site's config
 *   PATCH /api/cms/platforms/trail?site=findes-ikke-xyz → 404   (this one was right)
 *
 * The assumption was not wrong so much as unenforced — it held for the handlers
 * someone remembered. This pins the enforcement at the single place tenant
 * resolution happens, so the next route inherits it.
 *
 * These are source-level assertions on purpose: proxy.ts is Next.js middleware
 * and cannot be invoked from vitest, and the alternative — asserting on a
 * handler — would prove the symptom rather than the fix. The RUNTIME proof is
 * the reproduction in the plan-doc, re-run against a live server.
 */
const proxy = fs.readFileSync(
  path.join(PKG_ROOT, "src/proxy.ts"),
  "utf-8",
);

/** The `?site=` resolution block, isolated so the assertions cannot drift onto
 *  the F146 slug router, which resolves a DIFFERENT thing the same way. */
function siteOverrideBlok(): string {
  const start = proxy.indexOf("let siteOverrideCookies");
  expect(start, "the ?site= resolution block is gone — has it moved?").toBeGreaterThan(-1);
  const end = proxy.indexOf("if (siteOverrideCookies.length > 0)", start);
  expect(end).toBeGreaterThan(start);
  return proxy.slice(start, end);
}

describe("an unknown ?site= is refused in proxy.ts", () => {
  it("returns 404 rather than falling through to the registry default", () => {
    const blok = siteOverrideBlok();
    expect(blok).toContain("status: 404");
    expect(blok).toMatch(/site not found/);
  });

  it("refuses only when the lookup actually FAILED", () => {
    // The flag is the whole correctness of it: a refusal that does not depend on
    // the lookup result would 404 every request carrying ?site=, including the
    // four real tenants. That version passes a "does it 404?" test.
    const blok = siteOverrideBlok();
    expect(blok).toMatch(/if\s*\(\s*!fundet\s*\)/);
    expect(blok).toMatch(/fundet\s*=\s*true/);
  });

  it("still injects the tenant cookies when the site DOES resolve", () => {
    const blok = siteOverrideBlok();
    expect(blok).toContain("cms-active-org=");
    expect(blok).toContain("cms-active-site=");
  });

  it("leaves /admin/* alone — the refusal is scoped to the API", () => {
    // A hard 404 on an admin PAGE would take someone following a stale link out
    // of their workspace instead of landing them in it. Different change,
    // different card. The block only runs under isApi.
    const start = proxy.indexOf("let siteOverrideCookies");
    const foran = proxy.slice(Math.max(0, start - 400), start + 200);
    expect(foran).toContain("if (isApi)");
  });

  it("says WHICH site was refused, so a typo is fixable from the response", () => {
    expect(siteOverrideBlok()).toMatch(/\$\{overrideSite\}/);
  });
});
