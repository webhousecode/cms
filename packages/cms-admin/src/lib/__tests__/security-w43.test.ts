/**
 * Security W43 — the critical findings that were still open or partial after
 * the W41 round (verified against HEAD 75c3fcc2). One test per door.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeActiveSiteCookies, activeSiteFromCookieHeader } from "../active-site-cookie";
import { capScopesToRole } from "../mcp-config";
import { safeMediaSource } from "../wp-migration/extract-content";
import { assertPathSegment } from "@webhouse/cms";

const src = (p: string) => readFileSync(path.join(__dirname, "..", "..", p), "utf8");
const registry = {
  defaultOrgId: "own", defaultSiteId: "mine",
  orgs: [
    { id: "own", name: "Own", sites: [{ id: "mine", name: "Mine", configPath: "/x" }] },
    { id: "victim", name: "Victim", sites: [{ id: "theirs", name: "Theirs", configPath: "/y" }] },
  ],
} as never;

describe("C7 — the forwarded org/site pair is the one the route will use", () => {
  it("own site + victim org resolves to the VICTIM's site, explicitly", () => {
    const out = sanitizeActiveSiteCookies("cms-active-org=victim; cms-active-site=mine", registry);
    expect(activeSiteFromCookieHeader(out)).toEqual({ orgId: "victim", siteId: "theirs" });
  });
  it("an org with no site cookie names the org's first site", () => {
    expect(activeSiteFromCookieHeader(sanitizeActiveSiteCookies("cms-active-org=victim", registry))).toEqual({ orgId: "victim", siteId: "theirs" });
  });
  it("a valid pair is untouched", () => {
    expect(activeSiteFromCookieHeader(sanitizeActiveSiteCookies("cms-active-org=own; cms-active-site=mine", registry))).toEqual({ orgId: "own", siteId: "mine" });
  });
  it("the proxy judges tokens on the sanitized site, not the raw cookie", () => {
    const proxy = src("proxy.ts");
    expect(proxy).toContain("const effectiveSite = activeSiteFromCookieHeader(sanitize(");
    expect(proxy).not.toMatch(/site: request\.nextUrl\.searchParams\.get\("site"\) \?\? request\.cookies\.get\("cms-active-site"\)/);
  });
  it("a token never grants more than its owner's role on the site", () => {
    expect(src("lib/permissions.ts")).toMatch(/if \(!\(await ownerRoleGrants\(permission\)\)\)/);
    expect(src("lib/require-role.ts")).toMatch(/hasWrite && ownerRole && ownerRole !== "viewer"/);
  });
});

describe("NY-H2→K — MCP scopes are capped by the owner's role", () => {
  const all = ["read", "write", "publish", "deploy", "ai", "admin"];
  it("viewer → read only", () => expect(capScopesToRole(all, "viewer")).toEqual(["read"]));
  it("editor never gets admin", () => expect(capScopesToRole(all, "editor")).not.toContain("admin"));
  it("admin keeps everything", () => expect(capScopesToRole(all, "admin")).toEqual(all));
  it("no role → nothing", () => expect(capScopesToRole(all, undefined)).toEqual([]));
});

describe("H2→K — every slug door is one path segment", () => {
  it("assertPathSegment refuses traversal", () => {
    for (const bad of ["../_data/users", "..", "a/b", "a\\b", ""]) expect(() => assertPathSegment(bad, "slug")).toThrow();
    expect(assertPathSegment("my-post-da", "slug")).toBe("my-post-da");
  });
  it("revisions, the GitHub adapter and document GET use it / gate it", () => {
    expect(src("lib/revisions.ts")).toMatch(/assertPathSegment\(slug, "slug"\)/);
    expect(readFileSync(path.join(__dirname, "../../../../cms/src/storage/github/adapter.ts"), "utf8")).toMatch(/assertPathSegment\(slug, 'slug'\)/);
    expect(src("app/api/cms/[collection]/[slug]/route.ts")).toMatch(/requirePermission\("content\.read"\)/);
  });
});

describe("NY-K2 / NY-K3 / C3", () => {
  it("Beam receive compares with a path separator", () => {
    expect(src("app/api/beam/receive/file/route.ts")).toMatch(/resolved\.startsWith\(siteRoot \+ path\.sep\)/);
  });
  it("move-site is instance-admin only", () => {
    expect(src("app/api/cms/registry/move-site/route.ts")).toMatch(/requireInstanceAdmin\(\)/);
  });
  it("mobile/me lists only the user's own sites", () => {
    expect(src("app/api/mobile/me/route.ts")).toMatch(/if \(!memberRole\) continue;/);
  });
});

describe("NY-K5 — WordPress media downloads", () => {
  it("refuses internal hosts and non-media types", () => {
    for (const bad of ["http://127.0.0.1/a.jpg", "http://localhost:3010/x.png", "http://10.0.0.5/a.jpg", "http://169.254.169.254/latest", "https://x.internal/a.jpg", "https://ex.com/evil.html", "https://ex.com/x.svg", "file:///etc/passwd"]) {
      expect(safeMediaSource(bad), bad).toBeNull();
    }
  });
  it("allows a public image", () => expect(safeMediaSource("https://ex.com/wp-content/uploads/a.JPG")).toEqual({ ext: ".jpg" }));
});

import { membershipDecision } from "../site-membership-gate";

describe("W43 root cause — a session user only reaches sites they are on", () => {
  const base = { pathname: "/api/media/rotate", method: "POST", sub: "u", selfDescribing: false, instanceAdmin: false, site: { orgId: "o", siteId: "victim" }, team: [{ userId: "other" }] };
  it("refuses a non-member on an unguarded route", () => expect(membershipDecision(base)).toBe("not-a-member"));
  it("lets a member through", () => expect(membershipDecision({ ...base, team: [{ userId: "u" }] })).toBeNull());
  it("lets the instance admin and the self-describing principals through", () => {
    expect(membershipDecision({ ...base, instanceAdmin: true })).toBeNull();
    expect(membershipDecision({ ...base, selfDescribing: true })).toBeNull();
  });
  it("exempts user-level routes and the registry listing (GET only)", () => {
    for (const p of ["/api/auth/me", "/api/admin/profile", "/api/admin/invitations/accept", "/api/mobile/me"]) expect(membershipDecision({ ...base, pathname: p })).toBeNull();
    expect(membershipDecision({ ...base, pathname: "/api/cms/registry", method: "GET" })).toBeNull();
    expect(membershipDecision({ ...base, pathname: "/api/cms/registry", method: "POST" })).toBe("not-a-member");
  });
  it("single-site mode has no tenants to separate", () => expect(membershipDecision({ ...base, site: null })).toBeNull());
  it("the proxy calls it on the session path", () => {
    expect(src("proxy.ts")).toMatch(/const refused = membershipDecision\(/);
  });
});
