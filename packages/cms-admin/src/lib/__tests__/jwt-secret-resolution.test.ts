import { describe, it, expect } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { DEV_JWT_SECRET, resolveJwtSecret } from "../dev-jwt-secret";

/**
 * A session only works if the party that SIGNS the token and the party that
 * VERIFIES it resolve the same secret. They stopped agreeing, and the way it
 * failed is the point: not a 401, but a crash inside `jose` before any request
 * was made.
 *
 * Measured on CI run 32343397458 (2026-08-20), the E2E job:
 *
 *   DataError: Zero-length key is not supported
 *       at getSigKey (.../jose/dist/webapi/lib/signing.js:47:30)
 *
 *   41 failed, 1 passed
 *
 * The repo secret CMS_JWT_SECRET is not set, and GitHub Actions renders an
 * unset secret as the EMPTY STRING rather than omitting the variable. Eleven
 * test helpers wrote `process.env.CMS_JWT_SECRET ?? ""`, and `??` treats "" as
 * a value — so they signed with a zero-length key while the server fell back to
 * DEV_JWT_SECRET.
 *
 * These tests fail if either half of that contract drifts again.
 */
describe("resolveJwtSecret", () => {
  it("falls back to the dev secret when nothing is set", () => {
    expect(resolveJwtSecret({})).toBe(DEV_JWT_SECRET);
  });

  it("treats an EMPTY secret as unset — this is the CI case", () => {
    // `?? ""` returned "" here. That is the whole bug.
    expect(resolveJwtSecret({ CMS_JWT_SECRET: "" })).toBe(DEV_JWT_SECRET);
    expect(resolveJwtSecret({ CMS_JWT_SECRET: "", JWT_SECRET: "" })).toBe(DEV_JWT_SECRET);
  });

  it("never returns an empty string, whatever the environment", () => {
    for (const env of [{}, { CMS_JWT_SECRET: "" }, { JWT_SECRET: "" }, { CMS_JWT_SECRET: "", JWT_SECRET: "" }]) {
      expect(resolveJwtSecret(env).length).toBeGreaterThan(0);
    }
  });

  it("prefers a real secret over the dev fallback", () => {
    expect(resolveJwtSecret({ CMS_JWT_SECRET: "real" })).toBe("real");
    expect(resolveJwtSecret({ JWT_SECRET: "legacy" })).toBe("legacy");
    expect(resolveJwtSecret({ CMS_JWT_SECRET: "real", JWT_SECRET: "legacy" })).toBe("real");
  });

  it("signs a usable token in the exact environment CI runs in", async () => {
    // The E2E fixture's job, reproduced: with an empty CMS_JWT_SECRET, sign a
    // session cookie and verify it the way the middleware does.
    const env = { CMS_JWT_SECRET: "" };
    const key = new TextEncoder().encode(resolveJwtSecret(env));

    const token = await new SignJWT({ sub: "test-user", email: "cb@webhouse.dk", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key);

    const { payload } = await jwtVerify(token, new TextEncoder().encode(resolveJwtSecret(env)));
    expect(payload.email).toBe("cb@webhouse.dk");
  });

  it("a zero-length key really does throw — the failure this prevents", async () => {
    await expect(
      new SignJWT({ sub: "x" })
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode("")),
    ).rejects.toThrow(/Zero-length key/);
  });
});
