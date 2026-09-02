import { describe, expect, it } from "vitest";
import { extractLinkTargets, isExternalHost, isSchemeless, withHttps } from "./link-target";

describe("isSchemeless", () => {
  // Christian, 2026-09-02: typed www.trailmem.com into the free-address field
  // and the link landed on /bag-om/www.trailmem.com. Valid HTML, dead link.
  it("flags an address the browser will read as a path on this site", () => {
    expect(isSchemeless("www.trailmem.com")).toBe(true);
    expect(isSchemeless("trailmem.com")).toBe(true);
    expect(isSchemeless("example.com/side")).toBe(true);
    expect(isSchemeless("  trailmem.com  ")).toBe(true);
  });

  // The negative control. Without it, a predicate that always returned true
  // would pass every test above — and would then nag on every correct address
  // until editors learned to ignore the notice entirely.
  it("stays quiet on every address that is already unambiguous", () => {
    for (const ok of [
      "https://www.trailmem.com",
      "http://example.com",
      "HTTPS://EXAMPLE.COM",
      "/flagskibe/trail",
      "#kontakt",
      "?side=2",
      "mailto:cb@webhouse.dk",
      "tel:+4512345678",
      "//cdn.example.com/x.js",
      "",
      "   ",
    ]) {
      expect(isSchemeless(ok), ok).toBe(false);
    }
  });

  // These are the false positives that made us refuse to auto-normalise: they
  // are correctly flagged as DOUBTFUL, and would be corrupted by a rewrite.
  // The notice asks; it must never decide.
  it("flags relative paths that merely look like hostnames", () => {
    expect(isSchemeless("index.html")).toBe(true);
    expect(isSchemeless("v2.0-noter")).toBe(true);
    expect(isSchemeless("docs/kom-i-gang.md")).toBe(true);
  });
});

describe("withHttps", () => {
  it("prefixes the scheme without doubling a slash", () => {
    expect(withHttps("trailmem.com")).toBe("https://trailmem.com");
    expect(withHttps("  www.trailmem.com ")).toBe("https://www.trailmem.com");
    expect(withHttps("/trailmem.com")).toBe("https://trailmem.com");
  });
});

describe("isExternalHost", () => {
  it("is true only for an http(s) address on another host", () => {
    expect(isExternalHost("https://www.trailmem.com", "broberg.ai")).toBe(true);
    expect(isExternalHost("https://broberg.ai/flagskibe", "broberg.ai")).toBe(false);
    expect(isExternalHost("https://BROBERG.AI/x", "broberg.ai")).toBe(false);
  });

  it("is false for anything we cannot resolve to a host", () => {
    // A schemeless or relative address must not default the new-tab box on:
    // the whole point is that we do not know where it goes.
    expect(isExternalHost("trailmem.com", "broberg.ai")).toBe(false);
    expect(isExternalHost("/flagskibe", "broberg.ai")).toBe(false);
    expect(isExternalHost("mailto:cb@webhouse.dk", "broberg.ai")).toBe(false);
    expect(isExternalHost("https://", "broberg.ai")).toBe(false);
  });
});

describe("extractLinkTargets", () => {
  it("finds both HTML anchors and Markdown links", () => {
    const md = 'se [Trail](www.trailmem.com) og <a href="/flagskibe">her</a>';
    expect(extractLinkTargets(md)).toEqual([
      { syntax: "html", value: "/flagskibe" },
      { syntax: "markdown", value: "www.trailmem.com" },
    ]);
  });

  it("ignores Markdown image sources", () => {
    // A relative image path is normal and correct. Flagging it would bury the
    // real findings under noise until nobody reads the report.
    expect(extractLinkTargets("![foto](uploads/x.jpg)")).toEqual([]);
  });

  it("handles single-quoted href and finds nothing in plain prose", () => {
    expect(extractLinkTargets("<a href='trailmem.com'>x</a>")).toEqual([
      { syntax: "html", value: "trailmem.com" },
    ]);
    expect(extractLinkTargets("ingen links her overhovedet")).toEqual([]);
  });
});
