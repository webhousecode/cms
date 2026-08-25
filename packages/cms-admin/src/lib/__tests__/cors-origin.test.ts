import { describe, it, expect } from "vitest";
import { originAllowed, siteOrigins } from "../cors-origin";

describe("originAllowed", () => {
  // The regression this fixes: a browser Origin header never has a trailing
  // slash, but previewSiteUrl often does. Exact string compare dropped ACAO →
  // inline-edit save failed with a red "Fejl" pill (sanneandersen, 2026-07-12).
  it("matches a slash-less Origin against a previewSiteUrl WITH a trailing slash", () => {
    expect(
      originAllowed("https://sanneandersen-site.fly.dev", ["https://sanneandersen-site.fly.dev/"]),
    ).toBe(true);
  });

  it("matches when previewSiteUrl carries a path", () => {
    expect(originAllowed("https://site.example", ["https://site.example/da/preview"])).toBe(true);
  });

  it("still matches an exact origin (no trailing slash on either side)", () => {
    expect(originAllowed("https://broberg.ai", ["https://broberg.ai"])).toBe(true);
  });

  it("honours the wildcard", () => {
    expect(originAllowed("https://anything.example", ["*"])).toBe(true);
  });

  it("rejects a different host", () => {
    expect(originAllowed("https://evil.example", ["https://broberg.ai/"])).toBe(false);
  });

  it("rejects when scheme differs (http vs https)", () => {
    expect(originAllowed("http://broberg.ai", ["https://broberg.ai/"])).toBe(false);
  });

  it("returns false for a null origin", () => {
    expect(originAllowed(null, ["https://broberg.ai"])).toBe(false);
  });

  it("does not throw on a malformed allowed entry, just skips it", () => {
    expect(originAllowed("https://broberg.ai", ["not a url", "https://broberg.ai/"])).toBe(true);
    expect(originAllowed("https://broberg.ai", ["not a url"])).toBe(false);
  });
});

describe("siteOrigins", () => {
  it("accepts the live domain AND the staging address at the same time", () => {
    const origins = siteOrigins({
      previewSiteUrl: "https://www.webhouse.dk",
      deployCustomDomain: "wh-site.webhouse.net",
    });
    expect(originAllowed("https://www.webhouse.dk", origins)).toBe(true);
    expect(originAllowed("https://wh-site.webhouse.net", origins)).toBe(true);
  });

  // The regression this exists for: previewSiteUrl moved to the live domain
  // the day webhouse.dk was pointed at the site, and every inline-edit save
  // from the staging address went dead — the response simply had no
  // Access-Control-Allow-Origin.
  it("does not lose a host just because previewSiteUrl moved", () => {
    const before = siteOrigins({ previewSiteUrl: "https://wh-site.webhouse.net" });
    const after = siteOrigins({
      previewSiteUrl: "https://www.webhouse.dk",
      deployCustomDomain: "wh-site.webhouse.net",
    });
    expect(originAllowed("https://wh-site.webhouse.net", before)).toBe(true);
    expect(originAllowed("https://wh-site.webhouse.net", after)).toBe(true);
  });

  it("gives a bare host a scheme — an Origin header always has one", () => {
    expect(siteOrigins({ deployCustomDomain: "example.com" })).toEqual(["https://example.com"]);
    expect(siteOrigins({ deployCustomDomain: "http://example.com" })).toEqual(["http://example.com"]);
  });

  it("still refuses a host the site has not configured", () => {
    const origins = siteOrigins({ previewSiteUrl: "https://www.webhouse.dk" });
    expect(originAllowed("https://evil.example", origins)).toBe(false);
    expect(originAllowed("https://webhouse.dk.evil.example", origins)).toBe(false);
  });

  it("skips empty and whitespace-only entries, and never repeats one", () => {
    expect(siteOrigins({ previewSiteUrl: "", deployProductionUrl: "   " })).toEqual([]);
    expect(
      siteOrigins({ previewSiteUrl: "https://a.dk", deployProductionUrl: "https://a.dk" }),
    ).toEqual(["https://a.dk"]);
  });
});
