import { describe, it, expect } from "vitest";
import { originAllowed } from "../cors-origin";

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
