import { describe, it, expect } from "vitest";
import { docPath } from "../doc-url";

/**
 * Characterisation tests for the path logic lifted out of collection-list.tsx
 * (F164.2). The link picker and the preview button now share this one
 * implementation, so these lock in the behaviour preview already relied on —
 * "Preview MUST Always Work" is a hard rule, and a silent change here breaks
 * both surfaces at once.
 */
describe("docPath", () => {
  it("defaults to /<collection>/<slug> when no urlPrefix is set", () => {
    expect(docPath({ slug: "zoneterapi" }, { collection: "behandlinger" })).toBe(
      "/behandlinger/zoneterapi",
    );
  });

  it("uses urlPrefix when given", () => {
    expect(
      docPath({ slug: "min-post" }, { collection: "posts", urlPrefix: "/blog" }),
    ).toBe("/blog/min-post");
  });

  it("resolves a urlPattern from the document's own fields", () => {
    expect(
      docPath(
        { slug: "min-post", data: { category: "ai-metode" } },
        { collection: "posts", urlPrefix: "", urlPattern: "/:category/:slug" },
      ),
    ).toBe("/ai-metode/min-post");
  });

  // broberg-ai, measured on prod: posts declares urlPattern "/:category/:slug"
  // and NO urlPrefix. The old "/<collection>" guess produced
  // /en/posts/ai-metode/<slug> — a 404 — where the real page is
  // /en/ai-metode/<slug>. Every blog-post link and preview pointed at nothing.
  it("does not invent a collection prefix in front of a urlPattern", () => {
    expect(
      docPath(
        { slug: "ai-in-your-processes", locale: "en", data: { category: "ai-metode" } },
        { collection: "posts", urlPattern: "/:category/:slug", defaultLocale: "da" },
      ),
    ).toBe("/en/ai-metode/ai-in-your-processes");
  });

  it("still honours an EXPLICIT prefix alongside a pattern", () => {
    expect(
      docPath(
        { slug: "min-post", data: { category: "nyheder" } },
        { collection: "posts", urlPrefix: "/blog", urlPattern: "/:category/:slug" },
      ),
    ).toBe("/blog/nyheder/min-post");
  });

  it("prefixes a non-default locale and strips the slug's locale suffix", () => {
    expect(
      docPath(
        { slug: "om-sanne-en", locale: "en" },
        { collection: "sider", urlPrefix: "/sider", defaultLocale: "da" },
      ),
    ).toBe("/en/sider/om-sanne");
  });

  it("leaves the default locale unprefixed", () => {
    expect(
      docPath(
        { slug: "om-sanne", locale: "da" },
        { collection: "sider", urlPrefix: "/sider", defaultLocale: "da" },
      ),
    ).toBe("/sider/om-sanne");
  });

  it("prefixes every locale under prefix-all", () => {
    expect(
      docPath(
        { slug: "om-sanne", locale: "da" },
        { collection: "sider", urlPrefix: "/sider", localeStrategy: "prefix-all", defaultLocale: "da" },
      ),
    ).toBe("/da/sider/om-sanne");
  });

  it("uses the slug verbatim under the 'none' strategy", () => {
    expect(
      docPath(
        { slug: "om-sanne-en", locale: "en" },
        { collection: "sider", urlPrefix: "/sider", localeStrategy: "none", defaultLocale: "da" },
      ),
    ).toBe("/sider/om-sanne-en");
  });

  it("maps a root-level home/index document to /", () => {
    expect(docPath({ slug: "home" }, { collection: "pages", urlPrefix: "" })).toBe("/");
    expect(docPath({ slug: "index" }, { collection: "pages", urlPrefix: "/" })).toBe("/");
  });

  it("maps a localised homepage to /<locale>/", () => {
    expect(
      docPath(
        { slug: "home-en", locale: "en" },
        { collection: "pages", urlPrefix: "", defaultLocale: "da" },
      ),
    ).toBe("/en/");
  });
});
