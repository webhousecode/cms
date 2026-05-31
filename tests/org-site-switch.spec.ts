import { test, expect } from "playwright/test";
import { SignJWT } from "jose";

const BASE_URL = "http://localhost:3010";
const JWT_SECRET =
  process.env.CMS_JWT_SECRET ??
  process.env.JWT_SECRET ?? "";

/**
 * F141 — Site switch must fully re-hydrate workspace context.
 *
 * Root cause (fixed): the site/org switchers used router.push() to
 * /admin/switch/<id>. The Next.js App Router client cache serves the
 * destination URL's Server Component payload from cache, so the sidebar +
 * content listing rendered against the PREVIOUS site's cookie even though
 * the switch route had already updated cms-active-site. The fix is a
 * full-page navigation (window.location) so every Server Component
 * re-executes against the new cookie.
 *
 * These tests assert the server-side contract that makes the fix correct:
 * the /admin/switch/<id> route sets cms-active-site server-side, and a
 * fresh request to /admin then resolves that site. They do NOT depend on
 * the client Router Cache (which is exactly the thing the bug abused).
 */

interface Registry {
  orgs: Array<{ id: string; sites: Array<{ id: string; name: string; slug?: string }> }>;
}

async function authCookie() {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ sub: "dev-token", email: "cb@webhouse.dk", name: "E2E" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  return token;
}

test.describe("Org/Site Switching (F141)", () => {
  let registry: Registry | null = null;
  let token = "";

  test.beforeAll(async () => {
    token = await authCookie();
    const res = await fetch(`${BASE_URL}/api/registry`, {
      headers: { Cookie: `cms-session=${token}` },
    });
    if (res.ok) registry = (await res.json()) as Registry;
  });

  test("switch route sets cms-active-site server-side", async ({ context, page }) => {
    test.skip(!registry, "registry not reachable — is the dev server on :3010?");
    const sites = registry!.orgs.flatMap((o) => o.sites.map((s) => ({ ...s, orgId: o.id })));
    test.skip(sites.length < 2, "need ≥2 sites to test switching");

    const [, siteB] = sites;

    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
    ]);

    // Hit the switch route directly — it must set the cookie + redirect.
    await page.goto(`${BASE_URL}/admin/switch/${siteB.id}`, { waitUntil: "domcontentloaded" });

    const cookies = await context.cookies();
    const activeSite = cookies.find((c) => c.name === "cms-active-site");
    expect(activeSite?.value).toBe(siteB.id);

    // After the switch redirect we must land in /admin (not still on /switch).
    expect(page.url()).toContain("/admin");
    expect(page.url()).not.toContain("/switch/");
  });

  test("active site persists across a full reload", async ({ context, page }) => {
    test.skip(!registry, "registry not reachable — is the dev server on :3010?");
    const sites = registry!.orgs.flatMap((o) => o.sites);
    test.skip(sites.length < 2, "need ≥2 sites to test switching");

    const siteB = sites[1];
    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
    ]);
    await page.goto(`${BASE_URL}/admin/switch/${siteB.id}`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "cms-active-site")?.value).toBe(siteB.id);
  });
});
