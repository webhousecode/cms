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

const JWT_SECRET =
  process.env.CMS_JWT_SECRET ??
  process.env.JWT_SECRET ??
  "***REMOVED-JWT-SECRET***";

type AuthFixtures = {
  authedPage: import("@playwright/test").Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page, context }, use) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({
      sub: "test-user",
      email: "cb@webhouse.dk",
      name: "Test Admin",
      role: "admin",
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

export { expect } from "@playwright/test";

/** Sign a JWT with custom claims (for viewer, specific org/site, etc.) */
export async function signTestToken(claims: Record<string, unknown> = {}): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({
    sub: "test-user",
    email: "cb@webhouse.dk",
    name: "Test Admin",
    role: "admin",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}
