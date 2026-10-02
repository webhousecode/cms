/**
 * F205.1 — a wh_ token may only act on its own sites, with its own permissions.
 * Every case below is a shape that exists in production today (inventoried
 * 2026-10-02), not an invented one.
 */
import { describe, it, expect } from "vitest";
import { decideTokenRequest, normalizeResources, requiredFor } from "../token-scope";
import type { StoredToken } from "../access-tokens";

function tok(over: Partial<StoredToken>): StoredToken {
  return {
    id: "t", name: "t", hash: "h", userId: "u", createdAt: "2026-01-01T00:00:00Z",
    displayPrefix: null, permissions: [], resources: [], ipFilters: [],
    ...over,
  } as StoredToken;
}

const trail = tok({
  permissions: ["content:read", "content:write", "content:publish", "media:read", "media:write", "deploy:trigger", "deploy:read"],
  resources: [{ scope: "site", effect: "include", targets: ["trail"] }],
});
const decide = (t: StoredToken, method: string, pathname: string, site: string | null) =>
  decideTokenRequest({ token: t, method, pathname, site, clientIp: "1.2.3.4" });

describe("site scope", () => {
  it("allows a site token on its own site", () => {
    expect(decide(trail, "PATCH", "/api/cms/pages/x", "trail").allow).toBe(true);
    expect(decide(trail, "POST", "/api/upload", "trail").allow).toBe(true);
    expect(decide(trail, "POST", "/api/admin/deploy", "trail").allow).toBe(true);
  });

  it("refuses the same token on another site — the cross-org hole", () => {
    const d = decide(trail, "PATCH", "/api/cms/pages/x", "broberg-ai");
    expect(d).toMatchObject({ allow: false, kind: "site-mismatch" });
    expect(decide(trail, "POST", "/api/admin/deploy", "sanneandersen")).toMatchObject({ allow: false, kind: "site-mismatch" });
  });

  it("refuses a site token that names no site (it would land on the registry default)", () => {
    expect(decide(trail, "PATCH", "/api/cms/pages/x", null)).toMatchObject({ allow: false, kind: "no-site" });
  });

  it("refuses another site on routes the table does not know, too — not just log it", () => {
    // Found in review of 2028d017: an unmapped route returned "unmapped" before any
    // site comparison, and "unmapped" is log-only, so the cross-site hole stayed
    // open through every route not in the table.
    for (const path of ["/api/admin/site-config", "/api/schema/pages", "/api/admin/access-tokens"]) {
      expect(decide(trail, "POST", path, "broberg-ai")).toMatchObject({ allow: false, kind: "site-mismatch" });
    }
  });

  it("still lets an unrestricted token through without a site", () => {
    const all = tok({ permissions: ["content:read", "content:write"], resources: [] });
    expect(decide(all, "PATCH", "/api/cms/pages/x", null).allow).toBe(true);
    expect(decide(all, "PATCH", "/api/cms/pages/x", "broberg-ai").allow).toBe(true);
  });
});

describe("permissions", () => {
  it("refuses a permission the token does not carry", () => {
    const readOnly = tok({ permissions: ["content:read"], resources: [{ scope: "site", effect: "include", targets: ["trail"] }] });
    expect(decide(readOnly, "GET", "/api/cms/pages/x", "trail").allow).toBe(true);
    expect(decide(readOnly, "PATCH", "/api/cms/pages/x", "trail")).toMatchObject({ allow: false, kind: "permission" });
  });

  it("keeps a site token out of org-level admin routes", () => {
    expect(decide(trail, "POST", "/api/admin/access-tokens", "trail").allow).toBe(false);
    expect(decide(trail, "POST", "/api/cms/registry", "trail").allow).toBe(false);
  });

  it("denies unmapped routes unless the token is full-access", () => {
    expect(decide(trail, "POST", "/api/admin/site-config", "trail")).toMatchObject({ allow: false, kind: "unmapped" });
    const admin = tok({ permissions: ["*"] });
    expect(decide(admin, "POST", "/api/admin/site-config", "trail").allow).toBe(true);
  });

  it("lets any valid token ask who it is", () => {
    expect(decide(trail, "GET", "/api/auth/me", null).allow).toBe(true);
  });

  it("maps /api/cms/registry before /api/cms (order matters)", () => {
    expect(requiredFor("GET", "/api/cms/registry")?.permission).toBe("sites:read");
    expect(requiredFor("GET", "/api/cms/pages")?.permission).toBe("content:read");
  });
});

describe("stored resource shapes", () => {
  it("treats the legacy string form 'site:trail' as a restriction, not as unrestricted", () => {
    const legacy = tok({ permissions: ["content:write"], resources: ["site:trail"] as unknown as StoredToken["resources"] });
    expect(decide(legacy, "PATCH", "/api/cms/pages/x", "trail").allow).toBe(true);
    expect(decide(legacy, "PATCH", "/api/cms/pages/x", "sanneandersen")).toMatchObject({ allow: false, kind: "site-mismatch" });
  });

  it("refuses a token whose resource list cannot be read", () => {
    expect(normalizeResources([{ foo: 1 }])).toBeNull();
    const broken = tok({ permissions: ["*"], resources: [{ foo: 1 }] as unknown as StoredToken["resources"] });
    expect(decide(broken, "GET", "/api/cms/pages/x", "trail")).toMatchObject({ allow: false, kind: "malformed" });
  });
});
