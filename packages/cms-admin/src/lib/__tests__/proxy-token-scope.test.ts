/**
 * F205.1 — the wiring, not just the rule: a real request through proxy() with a
 * trail-only wh_ token must reach its own site and be refused on another, both
 * when the site is named with ?site= and when it is smuggled in as a cookie.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../site-registry", () => ({
  loadRegistry: vi.fn(async () => ({ orgs: [{ id: "broberg-ai", sites: [{ id: "trail" }, { id: "broberg-ai" }] }, { id: "webhouse", sites: [{ id: "sanneandersen" }] }] })),
  findSite: (_r: unknown, org: string, site: string) =>
    (org === "broberg-ai" && (site === "trail" || site === "broberg-ai")) || (org === "webhouse" && site === "sanneandersen")
      ? { id: site }
      : null,
  getDefaultSite: () => ({ org: { id: "broberg-ai" }, site: { id: "trail" } }),
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

  it("W43 C7 — is refused when its OWN site cookie sits next to a VICTIM org", async () => {
    // The raw cookie named trail (allowed) while the route resolved to the
    // victim org's site. The proxy now judges the sanitized pair.
    const res = await hit("/api/cms/pages/x", "PATCH", "cms-active-org=webhouse; cms-active-site=trail");
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

describe("proxy: W43 — a signed-in user reaches only the sites they are on", () => {
  async function asUser(path: string, method = "GET") {
    const { SignJWT } = await import("jose");
    const jwt = await new SignJWT({ sub: "u", email: "u@x", name: "U", role: "editor" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.CMS_JWT_SECRET!));
    const { proxy } = await import("../../proxy");
    return proxy(new NextRequest(`https://webhouse.app${path}`, { method, headers: { cookie: `cms-session=${jwt}` } }));
  }
  it("is refused on a site whose team they are not on (an unguarded route)", async () => {
    expect((await asUser("/api/media/rotate?site=sanneandersen", "POST")).status).toBe(403);
  });
  it("is let through on their own site", async () => {
    const res = await asUser("/api/media/rotate?site=trail", "POST");
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe("proxy: W43 H6 — the inline-edit token as a cookie cannot reach login settings", () => {
  async function asEditSession(path: string, method = "POST") {
    const { SignJWT } = await import("jose");
    const jwt = await new SignJWT({ sub: "u", email: "u@x", name: "U", role: "editor", editSession: true, site: "trail" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.CMS_JWT_SECRET!));
    const { proxy } = await import("../../proxy");
    return proxy(new NextRequest(`https://webhouse.app${path}`, { method, headers: { cookie: `cms-session=${jwt}` } }));
  }
  it("is refused on passkey registration and TOTP", async () => {
    for (const p of ["/api/auth/passkey/register/options", "/api/auth/totp/enroll/start", "/api/auth/qr/approve"]) {
      expect((await asEditSession(p)).status, p).toBe(403);
    }
  });
  it("may still read /api/auth/me", async () => {
    expect((await asEditSession("/api/auth/me", "GET")).status).not.toBe(403);
  });
});
