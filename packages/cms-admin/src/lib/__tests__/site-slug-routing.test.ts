import { describe, it, expect } from "vitest";
import {
  parseSiteSlugPath,
  siteAdminPath,
  RESERVED_ADMIN_SEGMENTS,
} from "../site-slug-routing";

describe("parseSiteSlugPath", () => {
  it("parses /admin/{slug}/rest into slug + slug-stripped rest", () => {
    expect(parseSiteSlugPath("/admin/trail/content/posts")).toEqual({
      slug: "trail",
      rest: "/admin/content/posts",
    });
  });

  it("parses bare /admin/{slug} → rest /admin", () => {
    expect(parseSiteSlugPath("/admin/trail")).toEqual({
      slug: "trail",
      rest: "/admin",
    });
  });

  it("returns null for bare /admin (no slug segment)", () => {
    expect(parseSiteSlugPath("/admin")).toBeNull();
    expect(parseSiteSlugPath("/admin/")).toBeNull();
  });

  it("returns null when first segment is a reserved route", () => {
    expect(parseSiteSlugPath("/admin/content/posts")).toBeNull();
    expect(parseSiteSlugPath("/admin/settings")).toBeNull();
    expect(parseSiteSlugPath("/admin/sites")).toBeNull();
    expect(parseSiteSlugPath("/admin/login")).toBeNull();
    expect(parseSiteSlugPath("/admin/switch/trail")).toBeNull();
  });

  it("returns null for non-admin paths", () => {
    expect(parseSiteSlugPath("/api/cms/registry")).toBeNull();
    expect(parseSiteSlugPath("/")).toBeNull();
  });

  it("treats a non-reserved first segment as a slug even if deep", () => {
    expect(parseSiteSlugPath("/admin/my-site/settings?tab=deploy".split("?")[0])).toEqual({
      slug: "my-site",
      rest: "/admin/settings",
    });
  });
});

describe("siteAdminPath", () => {
  it("prefixes an admin path with the slug", () => {
    expect(siteAdminPath("/admin/content/posts", "trail")).toBe(
      "/admin/trail/content/posts",
    );
  });

  it("prefixes bare /admin", () => {
    expect(siteAdminPath("/admin", "trail")).toBe("/admin/trail");
  });

  it("returns the path unchanged when slug is null/undefined/empty", () => {
    expect(siteAdminPath("/admin/content/posts", null)).toBe("/admin/content/posts");
    expect(siteAdminPath("/admin/content/posts", undefined)).toBe("/admin/content/posts");
    expect(siteAdminPath("/admin/content/posts", "")).toBe("/admin/content/posts");
  });

  it("does not double-prefix an already slug-prefixed path", () => {
    expect(siteAdminPath("/admin/trail/content/posts", "trail")).toBe(
      "/admin/trail/content/posts",
    );
  });

  it("leaves non-admin paths untouched", () => {
    expect(siteAdminPath("/api/cms/registry", "trail")).toBe("/api/cms/registry");
  });

  it("round-trips with parseSiteSlugPath", () => {
    const prefixed = siteAdminPath("/admin/content/posts", "trail");
    expect(parseSiteSlugPath(prefixed)).toEqual({
      slug: "trail",
      rest: "/admin/content/posts",
    });
  });
});

describe("RESERVED_ADMIN_SEGMENTS", () => {
  it("includes the known top-level admin routes", () => {
    for (const seg of ["content", "settings", "sites", "media", "login", "switch", "goto"]) {
      expect(RESERVED_ADMIN_SEGMENTS.has(seg)).toBe(true);
    }
  });
});
