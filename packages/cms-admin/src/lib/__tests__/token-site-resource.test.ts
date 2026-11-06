/**
 * A site-limited token was judged as "org:*" by requirePermission and refused
 * on its own site (sanneandersen, 6/11-2026: 403 "resource not in include set"
 * on GET /api/cms/brugerflade/account?site=sanneandersen).
 */
import { describe, it, expect } from "vitest";
import { evaluateToken, evaluateTokenOnSite, type StoredToken } from "../access-tokens";

function token(over: Partial<StoredToken>): StoredToken {
  return {
    id: "t1", name: "test", userId: "u1", hash: "x", prefix: "wh_x", createdAt: "2026-01-01T00:00:00.000Z",
    permissions: ["content:read", "content:write"], resources: [], ipFilters: [],
    ...over,
  } as StoredToken;
}

const siteToken = token({ resources: [{ effect: "include", scope: "site", targets: ["sanneandersen"] }] as never });

describe("evaluateTokenOnSite", () => {
  it("regression: judged as org:* alone, a site-limited token is refused", () => {
    expect(evaluateToken(siteToken, "content:read", "org:*", "1.2.3.4").reason).toBe("resource not in include set");
  });

  it("allows a site-limited token on its own site", () => {
    expect(evaluateTokenOnSite(siteToken, "content:read", "sanneandersen", "1.2.3.4").allow).toBe(true);
    expect(evaluateTokenOnSite(siteToken, "content:write", "sanneandersen", "1.2.3.4").allow).toBe(true);
  });

  it("still refuses it on another site", () => {
    expect(evaluateTokenOnSite(siteToken, "content:read", "webhouse-site", "1.2.3.4").allow).toBe(false);
  });

  it("still refuses a permission the token lacks", () => {
    const r = evaluateTokenOnSite(token({ permissions: ["content:read"], resources: siteToken.resources }), "content:write", "sanneandersen", "1.2.3.4");
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/missing permission/);
  });

  it("an org-wide token is unchanged (allowed with or without a site)", () => {
    const orgWide = token({});
    expect(evaluateTokenOnSite(orgWide, "content:read", "sanneandersen", "1.2.3.4").allow).toBe(true);
    expect(evaluateTokenOnSite(orgWide, "content:read", undefined, "1.2.3.4").allow).toBe(true);
  });

  it("an expired token stays refused on its own site", () => {
    const r = evaluateTokenOnSite({ ...siteToken, notAfter: "2020-01-01T00:00:00.000Z" }, "content:read", "sanneandersen", "1.2.3.4");
    expect(r.allow).toBe(false);
  });
});
