import { describe, expect, it } from "vitest";
import { isDangerousUrl, isSchemeless } from "@broberg/cms-inline-edit";
import { classifyByShape, isUnfetchable, normalisePath, sitemapPathsFromXml } from "../link-check-classify";

describe("isUnfetchable", () => {
  // 9 of 37 warnings on sanneandersen were a correct mail address reported as
  // "error: fetch failed", because the runner tried to fetch it.
  it("recognises the schemes there is nothing to fetch", () => {
    for (const u of [
      "mailto:mail@sanneandersen.dk",
      "MAILTO:x@y.dk",
      "  mailto:x@y.dk",
      "tel:+4512345678",
      "sms:+4512345678",
      "callto:someone",
      "fax:12345678",
      "geo:57.05,9.92",
      "bitcoin:1abc",
      "magnet:?xt=urn:btih:x",
    ]) {
      expect(isUnfetchable(u), u).toBe(true);
    }
  });

  // The negative control. A predicate that said "true" to everything would
  // pass every case above and silently stop checking the whole site.
  it("does not swallow an address that CAN be checked", () => {
    for (const u of [
      "https://www.trailmem.com",
      "http://example.com",
      "/da/privatliv",
      "#kontakt",
      "www.trailmem.com",
      "mailto.example.com", // a hostname that merely starts with the word
      "https://x.dk/?to=mailto:a@b.dk", // the scheme appears, but not as the scheme
      "",
    ]) {
      expect(isUnfetchable(u), u).toBe(false);
    }
  });
});

describe("sitemapPathsFromXml", () => {
  const XML = `<?xml version="1.0"?><urlset>
    <url><loc>https://sanneandersen.dk/da/privatliv</loc></url>
    <url><loc>https://sanneandersen.dk/da/handelsbetingelser/</loc></url>
    <url><loc>https://sanneandersen.dk/</loc></url>
  </urlset>`;

  // The six pages the tool called dead were all live: 200 × 4, 307 × 2. They
  // are static routes, so the document-derived list could never hold them.
  it("reads the site's own paths, trailing slash normalised away", () => {
    const paths = sitemapPathsFromXml(XML)!;
    expect(paths.has("/da/privatliv")).toBe(true);
    expect(paths.has("/da/handelsbetingelser")).toBe(true);
    expect(paths.has("/")).toBe(true);
    expect(paths.has("/da/findes-ikke")).toBe(false); // still says no when it means no
  });

  // Returns null rather than an empty set, so the caller reports "not
  // verified" instead of marking every internal link broken — or, worse, ok.
  it("returns null when there is nothing usable, and survives a bad entry", () => {
    expect(sitemapPathsFromXml("")).toBeNull();
    expect(sitemapPathsFromXml("<urlset></urlset>")).toBeNull();
    expect(sitemapPathsFromXml("<loc>ikke-en-url</loc>")).toBeNull();
    const mixed = sitemapPathsFromXml("<loc>ikke-en-url</loc><loc>https://x.dk/ok</loc>")!;
    expect(mixed.has("/ok")).toBe(true);
    expect(mixed.size).toBe(1);
  });
});

describe("normalisePath", () => {
  it("strips query, fragment and trailing slash the way a lookup needs", () => {
    expect(normalisePath("/da/privatliv/")).toBe("/da/privatliv");
    expect(normalisePath("/da/privatliv?x=1")).toBe("/da/privatliv");
    expect(normalisePath("/da/privatliv#top")).toBe("/da/privatliv");
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("")).toBe("/");
  });
});

/**
 * The shape-only verdicts, driven through the REAL function.
 *
 * Every case below is a false alarm that shipped and was measured afterwards,
 * not a hypothetical. The predicates come from @broberg/cms-inline-edit so the
 * editor's link dialog and this checker cannot disagree about what is doubtful.
 */
describe("classifyByShape", () => {
  const deps = { isSchemeless, isDangerousUrl };
  const link = (u: string) => classifyByShape("link", u, deps);
  const image = (u: string) => classifyByShape("image", u, deps);

  it("skips an address there is nothing to fetch", () => {
    // 9 of sanneandersen's 37 warnings were a correct mail address, reported
    // as `error: fetch failed`.
    expect(link("mailto:cb@webhouse.dk")?.status).toBe("skipped");
    expect(link("tel:+4512345678")?.status).toBe("skipped");
  });

  it("flags an address with no scheme, because a browser reads it as a page here", () => {
    expect(link("www.trailmem.com")?.status).toBe("schemeless");
  });

  it("does NOT flag a relative image source — that is normal and correct", () => {
    // Applying the href rule to images buries the real findings in noise; the
    // shared extractor skips them for exactly this reason.
    expect(image("uploads/foto.jpg")).toBeNull();
  });

  it("flags javascript: in a link", () => {
    expect(link("javascript:alert(1)")?.status).toBe("dangerous");
  });

  it("does NOT call an inline data-URI image dangerous", () => {
    // THE regression this test exists for: `data:` is dangerous in an href and
    // completely ordinary in an <img src>. TipTap stores a pasted image that
    // way, so the href rule applied to images paints every inline image red
    // with "remove it, it is a script".
    expect(image("data:image/png;base64,iVBORw0KGgo=")?.status).toBe("skipped");
  });

  it("still calls data: in a LINK dangerous", () => {
    // The negative control for the case above: sparing an inline image must
    // not be implemented as dropping the rule.
    expect(link("data:text/html,<script>alert(1)</script>")?.status).toBe("dangerous");
  });

  it("does flag javascript: in an image source", () => {
    // Deliberate, and the reason the dangerous rule is NOT narrowed to links:
    // an <img src="javascript:…"> renders nothing in any browser. The inline
    // data-URI image is spared by ORDER, not by a kind-guard — a guard that
    // could be deleted with every test still green protected nothing.
    expect(image("javascript:alert(1)")?.status).toBe("dangerous");
  });

  it("settles nothing for an ordinary address, so the caller goes and looks", () => {
    expect(link("https://webhouse.dk")).toBeNull();
    expect(link("/da/om-sanne")).toBeNull();
    expect(image("/uploads/hero.webp")).toBeNull();
  });
});
