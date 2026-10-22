/**
 * Security W41 — instance-level operations (registry, MCP servers, migration)
 * belong to the instance admin, not to any site's admin.
 */
import { describe, it, expect } from "vitest";
import { isInstanceAdminUser, siteAdminUpdateAllowed } from "../instance-admin";

const USERS = [
  { id: "owner", role: "admin" as const },
  { id: "legacy" },                       // first user, no stored role
  { id: "customer", role: "editor" as const },
];

describe("isInstanceAdminUser", () => {
  it("a user whose CMS-wide role is admin is the instance admin", () => {
    expect(isInstanceAdminUser({ sub: "owner" }, USERS)).toBe(true);
    expect(isInstanceAdminUser({ sub: "legacy" }, USERS)).toBe(true);
  });

  it("a customer (CMS-wide editor) is not — whatever their role on their own site", () => {
    expect(isInstanceAdminUser({ sub: "customer", role: "admin" }, USERS)).toBe(false);
  });

  it("a session whose user no longer exists is not", () => {
    expect(isInstanceAdminUser({ sub: "deleted", role: "admin" }, USERS)).toBe(false);
  });

  it("internal admin principals are; Lens (read-only) and no session are not", () => {
    expect(isInstanceAdminUser({ sub: "service-token", role: "admin" }, USERS)).toBe(true);
    expect(isInstanceAdminUser({ sub: "dev-token", role: "admin" }, USERS)).toBe(true);
    expect(isInstanceAdminUser({ sub: "lens", role: "admin" }, USERS)).toBe(false);
    expect(isInstanceAdminUser(null, USERS)).toBe(false);
  });
});

describe("siteAdminUpdateAllowed (registry update-site by a site's own admin)", () => {
  const cur = { configPath: "/data/s/cms.config.ts", contentDir: "/data/s/content", uploadDir: undefined };
  it("allows the Site Settings fields, and path fields sent back unchanged", () => {
    expect(siteAdminUpdateAllowed(cur, { homepageSlug: "home", homepageCollection: "pages", configPath: "/data/s/cms.config.ts", contentDir: "/data/s/content" })).toBe(true);
    // An unset path sent back empty (what Site Settings sends) is "unchanged".
    expect(siteAdminUpdateAllowed(cur, { name: "x", uploadDir: "" })).toBe(true);
  });
  it("clearing a set path is a change", () => {
    expect(siteAdminUpdateAllowed(cur, { contentDir: "" })).toBe(false);
  });
  it("refuses re-pointing a path (code execution via jiti) or any unknown field", () => {
    expect(siteAdminUpdateAllowed(cur, { configPath: "/data/s/public/uploads/x.ts" })).toBe(false);
    expect(siteAdminUpdateAllowed(cur, { contentDir: "/data/other/content" })).toBe(false);
    expect(siteAdminUpdateAllowed(cur, { adapter: "github" })).toBe(false);
  });
});
