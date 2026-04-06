/**
 * F81 — Homepage designation tests.
 */
import { describe, it, expect } from "vitest";
import { isHomepage, resolveHomepage } from "../homepage";
import type { SiteEntry } from "../site-registry";

const BASE_SITE: SiteEntry = {
  id: "test",
  name: "Test",
  adapter: "filesystem",
  configPath: "/tmp/cms.config.ts",
};

describe("isHomepage — explicit setting", () => {
  it("matches when slug and collection equal the explicit setting", () => {
    const site: SiteEntry = { ...BASE_SITE, homepageSlug: "welcome", homepageCollection: "pages" };
    expect(isHomepage(site, "pages", "welcome")).toBe(true);
  });

  it("does not match when slug differs from explicit setting", () => {
    const site: SiteEntry = { ...BASE_SITE, homepageSlug: "welcome", homepageCollection: "pages" };
    expect(isHomepage(site, "pages", "home")).toBe(false);
  });

  it("does not match when collection differs", () => {
    const site: SiteEntry = { ...BASE_SITE, homepageSlug: "welcome", homepageCollection: "pages" };
    expect(isHomepage(site, "posts", "welcome")).toBe(false);
  });

  it("defaults homepageCollection to 'pages' when only slug is set", () => {
    const site: SiteEntry = { ...BASE_SITE, homepageSlug: "landing" };
    expect(isHomepage(site, "pages", "landing")).toBe(true);
    expect(isHomepage(site, "posts", "landing")).toBe(false);
  });
});

describe("isHomepage — convention fallback", () => {
  it("matches slug 'home' on pages collection by default", () => {
    expect(isHomepage(BASE_SITE, "pages", "home")).toBe(true);
  });

  it("matches slug 'index' on pages collection by default", () => {
    expect(isHomepage(BASE_SITE, "pages", "index")).toBe(true);
  });

  it("does not match other slugs on pages collection", () => {
    expect(isHomepage(BASE_SITE, "pages", "about")).toBe(false);
    expect(isHomepage(BASE_SITE, "pages", "welcome")).toBe(false);
  });

  it("does not match slug 'home' on non-pages collection (without urlPrefix info)", () => {
    expect(isHomepage(BASE_SITE, "posts", "home")).toBe(false);
  });

  it("matches slug 'home' on any collection when urlPrefix is '/'", () => {
    expect(isHomepage(BASE_SITE, "sites", "home", "/")).toBe(true);
  });

  it("matches slug 'home' on any collection when urlPrefix is empty", () => {
    expect(isHomepage(BASE_SITE, "sites", "home", "")).toBe(true);
  });

  it("does not match when urlPrefix is a non-root path", () => {
    expect(isHomepage(BASE_SITE, "pages", "home", "/blog")).toBe(false);
  });

  it("works when site is null or undefined", () => {
    expect(isHomepage(null, "pages", "home")).toBe(true);
    expect(isHomepage(undefined, "pages", "home")).toBe(true);
    expect(isHomepage(null, "pages", "about")).toBe(false);
  });
});

describe("resolveHomepage", () => {
  it("returns explicit setting when present", () => {
    const site: SiteEntry = { ...BASE_SITE, homepageSlug: "landing", homepageCollection: "pages" };
    const result = resolveHomepage(site, []);
    expect(result).toEqual({ collection: "pages", slug: "landing", explicit: true });
  });

  it("finds conventional 'home' in available docs", () => {
    const result = resolveHomepage(BASE_SITE, [
      { collection: "pages", slug: "about", urlPrefix: "/" },
      { collection: "pages", slug: "home", urlPrefix: "/" },
    ]);
    expect(result).toEqual({ collection: "pages", slug: "home", explicit: false });
  });

  it("prefers 'home' over 'index' when both exist", () => {
    const result = resolveHomepage(BASE_SITE, [
      { collection: "pages", slug: "index", urlPrefix: "/" },
      { collection: "pages", slug: "home", urlPrefix: "/" },
    ]);
    expect(result?.slug).toBe("home");
  });

  it("falls back to 'index' when no 'home' exists", () => {
    const result = resolveHomepage(BASE_SITE, [
      { collection: "pages", slug: "about", urlPrefix: "/" },
      { collection: "pages", slug: "index", urlPrefix: "/" },
    ]);
    expect(result?.slug).toBe("index");
  });

  it("returns null when no convention match", () => {
    const result = resolveHomepage(BASE_SITE, [
      { collection: "pages", slug: "about", urlPrefix: "/" },
      { collection: "pages", slug: "contact", urlPrefix: "/" },
    ]);
    expect(result).toBeNull();
  });

  it("ignores convention match on non-root collections", () => {
    const result = resolveHomepage(BASE_SITE, [
      { collection: "posts", slug: "home", urlPrefix: "/blog" },
    ]);
    expect(result).toBeNull();
  });
});
