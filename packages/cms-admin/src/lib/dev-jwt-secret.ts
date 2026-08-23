/**
 * The one place the session-signing secret is resolved.
 *
 * Production always sets CMS_JWT_SECRET (a Fly secret), so DEV_JWT_SECRET only
 * ever signs anything in local dev and in CI, where no real secret exists.
 *
 * This is a module and not a literal because EVERY party to a session has to
 * agree on the value — the middleware that verifies the cookie, the routes that
 * mint it, and the eleven test files that fake one. They did not agree: the
 * server fell back to DEV_JWT_SECRET while every test helper fell back to `""`,
 * which `??` accepts as a real value, so `jose` was handed a zero-length key
 * and threw "Zero-length key is not supported". 38 of 41 E2E tests died there,
 * before reaching the server at all.
 *
 * Note `||`, not `??`: GitHub Actions sets an unset secret to the EMPTY STRING
 * rather than omitting the variable, and an empty HMAC key is never a valid
 * key. Empty must mean "not set" here, or CI signs with nothing.
 */
export const DEV_JWT_SECRET = "cms-dev-secret-change-me-in-production";

/** The signing secret for this process. Never empty. */
export function resolveJwtSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.CMS_JWT_SECRET || env.JWT_SECRET || DEV_JWT_SECRET;
}

/**
 * The `sub` a test token must carry to get a role.
 *
 * require-role.ts resolves a role by looking the `sub` up in the team-member
 * list, and short-circuits for three known principals: "dev-token",
 * "service-token" and "lens". Every other sub gets `null` — no role, 403 on
 * everything.
 *
 * Test helpers signed themselves as "test-user", which is not one of them. That
 * happened to work on a machine where a team member with that id existed and
 * gave nothing at all in CI, which is exactly the kind of difference that makes
 * a suite "pass on my machine".
 */
export const TEST_PRINCIPAL = "dev-token";
