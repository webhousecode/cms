/** Security W41 H9 — a production server without a secret signed with the public dev key. */
import { describe, it, expect } from "vitest";
import { resolveJwtSecret, DEV_JWT_SECRET } from "../dev-jwt-secret";

describe("resolveJwtSecret", () => {
  it("uses the configured secret", () => {
    expect(resolveJwtSecret({ CMS_JWT_SECRET: "s", NODE_ENV: "production" })).toBe("s");
  });
  it("refuses in production without one — never the public dev key", () => {
    expect(() => resolveJwtSecret({ NODE_ENV: "production" })).toThrow(/CMS_JWT_SECRET is not set/);
    expect(() => resolveJwtSecret({ NODE_ENV: "production", CMS_JWT_SECRET: "" })).toThrow();
  });
  it("keeps the dev key for local dev and tests", () => {
    expect(resolveJwtSecret({ NODE_ENV: "development" })).toBe(DEV_JWT_SECRET);
    expect(resolveJwtSecret({ NODE_ENV: "test" })).toBe(DEV_JWT_SECRET);
  });
});
