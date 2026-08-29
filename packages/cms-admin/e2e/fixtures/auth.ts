/**
 * F99 — Shared auth fixture for Playwright E2E tests.
 *
 * Provides an `authedPage` fixture that sets a valid JWT session cookie
 * before each test, bypassing the login UI.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/auth";
 *   test("example", async ({ authedPage: page }) => { ... });
 */
import { test as base } from "@playwright/test";
import { SignJWT } from "jose";
import { resolveJwtSecret, TEST_PRINCIPAL } from "../../src/lib/dev-jwt-secret";

/**
 * Must be the SAME secret the server under test verifies with, or every authed
 * test dies before it reaches the server.
 *
 * The old fallback here was "", which is not a missing value — `??` accepts it,
 * so `jose` was handed a zero-length key and threw "Zero-length key is not
 * supported" for 38 of 41 E2E tests. Falling back to the server's own dev
 * secret means these tests run with or without CMS_JWT_SECRET being set, which
 * is what CI needs: it has no secret to give them.
 */
const JWT_SECRET = resolveJwtSecret();

type AuthFixtures = {
  authedPage: import("@playwright/test").Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page, context }, use) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      sub: TEST_PRINCIPAL,
      email: "cb@webhouse.dk",
      name: "Test Admin",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    await context.addCookies([
      { name: "cms-session", value: token, domain: "localhost", path: "/" },
      // F178.5 — the sidebar is `collapsible="offcanvas"` and remembers its
      // state in this cookie. A fresh browser has none, so every authed test
      // opened onto a page whose nav is in the DOM but not VISIBLE, and
      // `toBeVisible()` on any nav item failed. That is not what those tests
      // are about; setting the cookie puts the workspace in the state a
      // returning user actually has.
      { name: "sidebar_state", value: "true", domain: "localhost", path: "/" },
      { name: "cms-active-org", value: "default", domain: "localhost", path: "/" },
      { name: "cms-active-site", value: "default", domain: "localhost", path: "/" },
    ]);

    await use(page);
  },
});

export { expect } from "@playwright/test";

/** Sign a JWT with custom claims (for viewer, specific org/site, etc.) */
export async function signTestToken(claims: Record<string, unknown> = {}): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({
    sub: TEST_PRINCIPAL,
    email: "cb@webhouse.dk",
    name: "Test Admin",
    role: "admin",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}
