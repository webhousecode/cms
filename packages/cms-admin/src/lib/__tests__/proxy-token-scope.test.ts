/**
 * F205.1 — the wiring, not just the rule: a real request through proxy() with a
 * trail-only wh_ token must reach its own site and be refused on another, both
 * when the site is named with ?site= and when it is smuggled in as a cookie.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../site-registry", () => ({
  loadRegistry: vi.fn(async () => ({ orgs: [{ id: "broberg-ai", sites: [] }, { id: "webhouse", sites: [] }] })),
  findSite: (_r: unknown, org: string, site: string) =>
    (org === "broberg-ai" && (site === "trail" || site === "broberg-ai")) || (org === "webhouse" && site === "sanneandersen")
      ? { id: site }
      : null,
  findSiteOrgId: (_r: unknown, site: string) =>
    site === "trail" || site === "broberg-ai" ? "broberg-ai" : site === "sanneandersen" ? "webhouse" : null,
}));

vi.mock("../access-tokens", async (orig) => {
  const actual = await orig<typeof import("../access-tokens")>();
  return {
    ...actual,
    verifyAccessToken: vi.fn(async (raw: string) =>
      raw === "wh_orphan"
        ? {
            id: "t-orphan", name: "orphan", hash: "h", userId: "orphan", createdAt: "2026-10-02T00:00:00Z",
            displayPrefix: null, ipFilters: [], permissions: ["*"], resources: [],
          }
        : raw === "wh_trail"
        ? {
            id: "t-trail", name: "trail — site agent", hash: "h", userId: "u", createdAt: "2026-10-02T00:00:00Z",
            displayPrefix: null, ipFilters: [],
            permissions: ["content:read", "content:write", "deploy:trigger"],
            resources: [{ scope: "site", effect: "include", targets: ["trail"] }],
          }
        : null,
    ),
  };
});

// W41 C7 — the token also acts only where its OWNER is on the team. Owner "u"
// is a CMS-wide editor on trail's team; "orphan" owns a token but is on no team.
vi.mock("../auth", async (orig) => {
  const actual = await orig<typeof import("../auth")>();
  return { ...actual, getUsers: vi.fn(async () => [{ id: "u", email: "u@x", role: "editor" }, { id: "orphan", email: "o@x", role: "editor" }]) };
});
vi.mock("../team", async (orig) => {
  const actual = await orig<typeof import("../team")>();
  return { ...actual, getTeamMembersForSite: vi.fn(async (_o: string, site: string) => (site === "trail" ? [{ userId: "u", role: "editor" }] : [])) };
});

beforeAll(() => {
  process.env.CMS_JWT_SECRET = "x".repeat(64);
});

async function hit(path: string, method = "PATCH", cookie = "", token = "wh_trail") {
  const { proxy } = await import("../../proxy");
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (cookie) headers.cookie = cookie;
  return proxy(new NextRequest(`https://webhouse.app${path}`, { method, headers }));
}

describe("proxy: a trail-only token", () => {
  it("is let through on its own site", async () => {
    const res = await hit("/api/cms/pages/x?site=trail");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it("is refused on another site named with ?site=", async () => {
    for (const site of ["broberg-ai", "sanneandersen"]) {
      const res = await hit(`/api/cms/pages/x?site=${site}`);
      expect(res.status).toBe(403);
    }
  });

  it("is refused when the other site is smuggled in as a cookie instead", async () => {
    const res = await hit("/api/cms/pages/x", "PATCH", "cms-active-site=broberg-ai");
    expect(res.status).toBe(403);
  });

  it("is refused a deploy of another site", async () => {
    const res = await hit("/api/admin/deploy?site=broberg-ai", "POST");
    expect(res.status).toBe(403);
  });
});

describe("proxy: a trail-only token naming no site", () => {
  it("is refused instead of landing on the registry's default site", async () => {
    const res = await hit("/api/admin/site-config", "POST");
    expect(res.status).toBe(403);
  });
});

describe("proxy: W41 C7 — a full-access token whose owner is on no team", () => {
  it("is refused on every site, though the token itself names none", async () => {
    for (const site of ["trail", "sanneandersen"]) {
      const res = await hit(`/api/admin/backups?site=${site}`, "GET", "", "wh_orphan");
      expect(res.status).toBe(403);
    }
  });
});
