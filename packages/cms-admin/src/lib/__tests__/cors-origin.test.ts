import { describe, it, expect } from "vitest";
import {
  originAllowed,
  siteOrigins,
  siteOriginsWithSiblings,
  normalizeDomainEntry,
  normalizeDomainList,
} from "../cors-origin";

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

describe("siteOriginsWithSiblings", () => {
  // sanneandersen.dk, launch day 2026-08-26. The site moved from its fly.dev
  // address to the real domain and three separate browser-facing gates still
  // read previewSiteUrl alone: inline editing refused the new domain outright
  // ("return origin not allowed"), and the contact form would have refused
  // every submission from it — silently, the visitor just sees a failed send.
  it("accepts the live domain while the staging address keeps working", () => {
    const origins = siteOriginsWithSiblings({
      previewSiteUrl: "https://sanneandersen-site.fly.dev",
      deployCustomDomain: "sanneandersen.dk",
    });
    expect(originAllowed("https://sanneandersen.dk", origins)).toBe(true);
    expect(originAllowed("https://sanneandersen-site.fly.dev", origins)).toBe(true);
  });

  it("accepts deployProductionUrl too, not only the other two", () => {
    const origins = siteOriginsWithSiblings({ deployProductionUrl: "https://prod.example.dk" });
    expect(originAllowed("https://prod.example.dk", origins)).toBe(true);
  });

  // A site that redirects www -> apex (or the reverse) would otherwise work or
  // fail depending on which form the editor happened to type.
  it("pairs a domain with its www sibling, both directions", () => {
    const apex = siteOriginsWithSiblings({ deployCustomDomain: "sanneandersen.dk" });
    expect(originAllowed("https://www.sanneandersen.dk", apex)).toBe(true);

    const www = siteOriginsWithSiblings({ previewSiteUrl: "https://www.example.dk" });
    expect(originAllowed("https://example.dk", www)).toBe(true);
  });

  // The widening is bounded: same registrable domain, literal "www." only.
  it("still refuses a foreign origin that merely looks similar", () => {
    const origins = siteOriginsWithSiblings({ deployCustomDomain: "sanneandersen.dk" });
    for (const bad of [
      "https://sanneandersen.dk.angriber.dk",
      "https://andensanneandersen.dk",
      "https://evil.dk",
      "http://sanneandersen.dk.co",
    ]) {
      expect(originAllowed(bad, origins), bad).toBe(false);
    }
  });

  it("does not invent a www sibling for an arbitrary subdomain", () => {
    const origins = siteOriginsWithSiblings({ previewSiteUrl: "https://app.example.dk" });
    expect(originAllowed("https://www.app.example.dk", origins)).toBe(false);
    expect(originAllowed("https://app.example.dk", origins)).toBe(true);
  });

  it("returns nothing when the site has no configured host", () => {
    expect(siteOriginsWithSiblings({})).toEqual([]);
    expect(originAllowed("https://anything.dk", siteOriginsWithSiblings({}))).toBe(false);
  });
});

describe("siteDomains — the operator-maintained list (F157.13)", () => {
  // The whole point of the field: a site that keeps its old domain alive, or
  // gains a fourth address, had nowhere to put it. Adding it here must make
  // the gate accept it — otherwise the self-service panel writes to a value
  // nothing reads, which is the failure this repo keeps meeting.
  it("a self-added domain is accepted by the gate", () => {
    const origins = siteOriginsWithSiblings({
      previewSiteUrl: "https://site.fly.dev",
      siteDomains: ["https://gammelt-domaene.dk"],
    });
    expect(originAllowed("https://gammelt-domaene.dk", origins)).toBe(true);
    expect(originAllowed("https://site.fly.dev", origins)).toBe(true);
  });

  it("a self-added domain gets its www sibling too", () => {
    const origins = siteOriginsWithSiblings({ siteDomains: ["https://kampagne.dk"] });
    expect(originAllowed("https://www.kampagne.dk", origins)).toBe(true);
  });

  it("still refuses everything that was not added", () => {
    const origins = siteOriginsWithSiblings({ siteDomains: ["https://kampagne.dk"] });
    expect(originAllowed("https://kampagne.dk.angriber.dk", origins)).toBe(false);
    expect(originAllowed("https://evil.dk", origins)).toBe(false);
  });

  // Existing sites have no such field. They must behave exactly as before.
  it("a site without the field behaves exactly as before", () => {
    const before = siteOriginsWithSiblings({ previewSiteUrl: "https://site.fly.dev" });
    const after = siteOriginsWithSiblings({ previewSiteUrl: "https://site.fly.dev", siteDomains: [] });
    expect(after).toEqual(before);
  });
});

describe("normalizeDomainEntry", () => {
  it("accepts a bare host and gives it a scheme", () => {
    expect(normalizeDomainEntry("eksempel.dk")).toEqual({ origin: "https://eksempel.dk" });
  });

  it("accepts a full URL and keeps its scheme", () => {
    expect(normalizeDomainEntry("http://eksempel.dk")).toEqual({ origin: "http://eksempel.dk" });
  });

  it("tolerates the trailing slash an address bar produces", () => {
    expect(normalizeDomainEntry("https://eksempel.dk/")).toEqual({ origin: "https://eksempel.dk" });
  });

  // Rejected rather than silently dropped: a domain someone typed and saw
  // vanish teaches nothing, and one silently accepted in a shape that can never
  // match an Origin header looks configured while doing nothing.
  it.each([
    ["", "tom"],
    ["*.eksempel.dk", "wildcard"],
    ["eksempel.dk/shop", "sti"],
    ["https://eksempel.dk/shop?a=1", "sti med query"],
    ["ikkeetdomæne", "uden punktum"],
  ])("refuses %s (%s) with a reason", (input) => {
    const r = normalizeDomainEntry(input);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error.length).toBeGreaterThan(5);
  });
});

describe("normalizeDomainList", () => {
  it("collapses two spellings of the same host into one entry", () => {
    expect(normalizeDomainList(["eksempel.dk", "https://eksempel.dk/"]))
      .toEqual({ domains: ["https://eksempel.dk"] });
  });

  it("fails the whole list on one bad entry, naming it", () => {
    const r = normalizeDomainList(["god.dk", "*.slem.dk"]);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("*.slem.dk");
  });

  it("an empty list is valid — that is how you clear it", () => {
    expect(normalizeDomainList([])).toEqual({ domains: [] });
  });
});
