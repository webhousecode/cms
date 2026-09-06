/**
 * Which tenant a call belongs to — the one question whose wrong answer is
 * silent and looks like success.
 *
 * `cookies()` throws once a request context is gone, and the catch inside
 * resolveActiveSiteIds then answers with the registry's DEFAULT site. That is
 * right for a boot-time or instrumentation caller and WRONG for work that
 * outlived a request: the write lands, the push lands, and both land on
 * somebody else's site. So the fallback is pinned here on purpose — not to
 * bless it, but so its existence is visible and any caller that must not take
 * it (the auto-translate continuation) is forced to carry the ids itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieGet = vi.fn();
let cookiesThrows = false;

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (cookiesThrows) throw new Error("cookies() outside a request scope");
    return { get: cookieGet };
  },
}));

const REGISTRY = {
  defaultOrgId: "webhouse",
  defaultSiteId: "webhouse-site",
  orgs: [],
} as never;

async function resolve() {
  const { resolveActiveSiteIds } = await import("../site-paths");
  return resolveActiveSiteIds(REGISTRY);
}

beforeEach(() => {
  vi.clearAllMocks();
  cookiesThrows = false;
  cookieGet.mockReturnValue(undefined);
});

describe("resolveActiveSiteIds", () => {
  it("prefers an explicit request-scoped override over everything else", async () => {
    // A cookie says one tenant, withSiteContext says another. The override wins
    // — that is what lets background work pin the tenant it captured.
    cookieGet.mockImplementation((n: string) =>
      n === "cms-active-org" ? { value: "other-org" } : { value: "other-site" },
    );
    const { withSiteContext } = await import("../site-context");
    const got = await withSiteContext({ orgId: "broberg", siteId: "broberg-ai" }, resolve);
    expect(got).toEqual({ orgId: "broberg", siteId: "broberg-ai" });
  });

  it("reads the active cookies when there is no override", async () => {
    cookieGet.mockImplementation((n: string) =>
      n === "cms-active-org" ? { value: "broberg" } : { value: "broberg-ai" },
    );
    expect(await resolve()).toEqual({ orgId: "broberg", siteId: "broberg-ai" });
  });

  it("falls back to the registry default when a cookie is absent", async () => {
    cookieGet.mockImplementation((n: string) =>
      n === "cms-active-org" ? { value: "broberg" } : undefined,
    );
    expect(await resolve()).toEqual({ orgId: "broberg", siteId: "webhouse-site" });
  });

  it("answers the registry DEFAULT — not an error — when there is no request context", async () => {
    // The dangerous case, pinned so it cannot be mistaken for a failure that
    // would be noticed. A caller outside a request gets webhouse-site back and
    // nothing tells it that it asked the wrong question.
    cookiesThrows = true;
    expect(await resolve()).toEqual({ orgId: "webhouse", siteId: "webhouse-site" });
  });

  it("an override still wins when there is no request context at all", async () => {
    // This is the property the auto-translate continuation depends on: it
    // captured the ids while the request was alive, so losing the context later
    // cannot redirect its write to another tenant.
    cookiesThrows = true;
    const { withSiteContext } = await import("../site-context");
    const got = await withSiteContext({ orgId: "broberg", siteId: "broberg-ai" }, resolve);
    expect(got).toEqual({ orgId: "broberg", siteId: "broberg-ai" });
  });
});
