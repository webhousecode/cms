/**
 * Security W41 C1 — a browser-chosen cms-active-org must never reach a file
 * path. `cms-active-org=../users` made org-settings read _data/users.json.
 */
import { describe, it, expect } from "vitest";
import { sanitizeActiveSiteCookies, isSafeId } from "../active-site-cookie";
import type { Registry } from "../site-registry";

const REG = {
  orgs: [
    { id: "webhouse", name: "w", sites: [{ id: "webhouse-site" }, { id: "sanneandersen" }] },
    { id: "broberg-ai", name: "b", sites: [{ id: "trail" }] },
  ],
} as unknown as Registry;

describe("sanitizeActiveSiteCookies", () => {
  it("keeps a real org + one of its sites, and every other cookie", () => {
    expect(sanitizeActiveSiteCookies("cms-session=x; cms-active-org=webhouse; cms-active-site=sanneandersen", REG))
      .toBe("cms-session=x; cms-active-org=webhouse; cms-active-site=sanneandersen");
  });

  it("drops a traversal org — and the site with it", () => {
    expect(sanitizeActiveSiteCookies("cms-session=x; cms-active-org=../users; cms-active-site=trail", REG))
      .toBe("cms-session=x");
  });

  it("drops an org that is not in the registry", () => {
    expect(sanitizeActiveSiteCookies("cms-active-org=evil; cms-active-site=trail", REG)).toBe("");
  });

  it("replaces a site that belongs to another org with the org's first site (W43 C7: one explicit pair)", () => {
    const first = (REG as { orgs: { id: string; sites: { id: string }[] }[] }).orgs.find((o) => o.id === "webhouse")!.sites[0]!.id;
    expect(sanitizeActiveSiteCookies("cms-active-org=webhouse; cms-active-site=trail", REG))
      .toBe(`cms-active-org=webhouse; cms-active-site=${first}`);
  });

  it("collapses duplicates to the LAST occurrence (the proxy appends its injected pair)", () => {
    expect(sanitizeActiveSiteCookies("cms-active-org=webhouse; cms-active-site=sanneandersen; cms-active-org=broberg-ai; cms-active-site=trail", REG))
      .toBe("cms-active-org=broberg-ai; cms-active-site=trail");
  });

  it("without a registry checks the shape only", () => {
    expect(sanitizeActiveSiteCookies("cms-active-org=a; cms-active-site=b", null)).toBe("cms-active-org=a; cms-active-site=b");
    expect(sanitizeActiveSiteCookies("cms-active-org=..; cms-active-site=b", null)).toBe("");
    expect(sanitizeActiveSiteCookies("cms-active-org=a; cms-active-site=..%2F", null)).toBe("cms-active-org=a");
  });
});

describe("isSafeId", () => {
  it("accepts the ids the CMS creates and refuses anything with a dot or slash", () => {
    for (const ok of ["webhouse", "broberg-ai", "lens-fixture-site", "a1", "x_y"]) expect(isSafeId(ok), ok).toBe(true);
    for (const bad of ["..", "../users", "a/b", "a.b", "", "-x", "A", "a b", "%2e%2e"]) expect(isSafeId(bad), bad).toBe(false);
  });
});
