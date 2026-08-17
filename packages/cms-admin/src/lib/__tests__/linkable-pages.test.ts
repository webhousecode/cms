import { describe, it, expect } from "vitest";
import {
  buildLinkablePages,
  matchDoc,
  parseSitemapLocs,
  titleFromPath,
  toPath,
  type CmsDocIndexEntry,
} from "../linkable-pages";

/**
 * F164.5 — the picker's list comes from the site's sitemap, not from paths
 * computed out of cms.config. The two tests that matter are the two REAL
 * failures that motivated it, both measured against production 2026-08-17.
 */

const index = new Map<string, CmsDocIndexEntry>([
  ["cms", { collection: "platforms", slug: "cms", title: "CMS", label: "Flagskibe" }],
  ["en-cms", { collection: "platforms", slug: "en-cms", title: "CMS", label: "Flagskibe" }],
  ["torsdagsholdet", {
    collection: "qigong-classes",
    slug: "torsdagsholdet",
    title: "Torsdagsholdet",
    label: "Qi Gong-hold",
  }],
  ["om-sanne", { collection: "sider", slug: "om-sanne", title: "Om Sanne", label: "Sider" }],
]);

const sitemap = (paths: string[], origin = "https://broberg.ai") =>
  `<?xml version="1.0"?><urlset>${paths
    .map((p) => `<url><loc>${origin}${p}</loc></url>`)
    .join("")}</urlset>`;

describe("linkable pages — the sitemap IS the list", () => {
  // broberg-ai: the route segment is translated per locale (flagskibe →
  // flagships) and the English slug's "en-" affix is not in the URL. The
  // computed path /en/flagskibe/en-cms 404s; /en/flagships/cms is the page.
  it("offers the page at the address the SITE publishes, translated segment and all", () => {
    const pages = buildLinkablePages(parseSitemapLocs(sitemap(["/en/flagships/cms"])), index);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.path).toBe("/en/flagships/cms");
    expect(pages[0]?.title).toBe("CMS"); // title still resolved from the CMS
  });

  // sanneandersen: qigong-classes documents have slugs because the CMS requires
  // them, not because they are pages — they render as sections on /qigong and
  // there is no [slug] route. The old list offered /qigong/torsdagsholdet (404).
  it("cannot offer a document that has no route, however published it is", () => {
    const pages = buildLinkablePages(parseSitemapLocs(sitemap(["/da/qigong"])), index);
    expect(pages.map((p) => p.path)).toEqual(["/da/qigong"]);
    expect(pages.some((p) => p.path.includes("torsdagsholdet"))).toBe(false);
  });

  it("lists a page the CMS knows nothing about, with a readable title", () => {
    const pages = buildLinkablePages(parseSitemapLocs(sitemap(["/en/behind-the-scenes"])), index);
    expect(pages[0]?.path).toBe("/en/behind-the-scenes");
    expect(pages[0]?.title).toBe("Behind the scenes");
    expect(pages[0]?.label).toBe("Side");
  });

  it("de-duplicates and normalises trailing slashes", () => {
    const pages = buildLinkablePages(
      parseSitemapLocs(sitemap(["/losninger/", "/losninger", "/"])),
      index,
    );
    expect(pages.map((p) => p.path).sort()).toEqual(["/", "/losninger"]);
  });
});

describe("matchDoc", () => {
  it("matches a plain slug", () => {
    expect(matchDoc("/flagskibe/cms", index)?.slug).toBe("cms");
  });

  it("matches both locale affix conventions", () => {
    expect(matchDoc("/en/flagships/cms", index)?.slug).toBe("en-cms"); // en-<slug>
    const suffixIndex = new Map<string, CmsDocIndexEntry>([
      ["om-sanne-en", { collection: "sider", slug: "om-sanne-en", title: "About", label: "Sider" }],
    ]);
    expect(matchDoc("/en/sider/om-sanne", suffixIndex)?.slug).toBe("om-sanne-en"); // <slug>-en
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(matchDoc("/helt/ukendt", index)).toBeNull();
  });
});

describe("parsing helpers", () => {
  it("reads loc entries and ignores the rest of the document", () => {
    const xml =
      '<urlset><url><loc>https://x.dk/a</loc><lastmod>2026-01-01</lastmod></url>' +
      "<url><loc>https://x.dk/b</loc></url></urlset>";
    expect(parseSitemapLocs(xml)).toEqual(["https://x.dk/a", "https://x.dk/b"]);
  });

  it("returns an empty list for a document with no locs", () => {
    expect(parseSitemapLocs("<urlset></urlset>")).toEqual([]);
  });

  it("converts absolute and relative locs to paths", () => {
    expect(toPath("https://x.dk/a/b")).toBe("/a/b");
    expect(toPath("/a/b")).toBe("/a/b");
    expect(toPath("https://x.dk/")).toBe("/");
    expect(toPath("mailto:x@y.dk")).toBeNull();
  });

  it("derives a readable title from a path", () => {
    expect(titleFromPath("/da/behandlinger/ansigts-zoneterapi")).toBe("Ansigts zoneterapi");
    expect(titleFromPath("/")).toBe("Forside");
  });
});
