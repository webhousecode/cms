/**
 * Security W41 C3 — the mobile API checked only the JWT signature, never
 * membership of the ?orgId=&siteId= the caller named.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decideMobileAccess } from "../mobile-site-access";

describe("decideMobileAccess", () => {
  it("no membership on the named site → 403, whatever the method", () => {
    expect(decideMobileAccess("GET", null)?.status).toBe(403);
    expect(decideMobileAccess("POST", null)?.status).toBe(403);
  });
  it("a viewer reads but never writes", () => {
    expect(decideMobileAccess("GET", "viewer")).toBeNull();
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) expect(decideMobileAccess(m, "viewer")?.status, m).toBe(403);
  });
  it("editors and admins proceed", () => {
    expect(decideMobileAccess("PATCH", "editor")).toBeNull();
    expect(decideMobileAccess("DELETE", "admin")).toBeNull();
  });
});

const team: Record<string, { userId: string; role: string }[]> = {
  "webhouse/sanneandersen": [{ userId: "sanne", role: "editor" }],
  "broberg-ai/trail": [{ userId: "cb", role: "admin" }],
};
vi.mock("../auth", () => ({ verifyToken: async (t: string) => (t === "bad" ? null : { sub: t, role: "admin" }) }));
vi.mock("../team", () => ({ getTeamMembersForSite: async (o: string, s: string) => team[`${o}/${s}`] ?? [] }));
vi.mock("../site-registry", () => ({
  loadRegistry: async () => ({ orgs: [{ id: "webhouse", sites: [{ id: "sanneandersen" }] }, { id: "broberg-ai", sites: [{ id: "trail" }] }] }),
  findSite: (r: { orgs: { id: string; sites: { id: string }[] }[] }, o: string, s: string) => r.orgs.find((x) => x.id === o)?.sites.find((x) => x.id === s) ?? null,
}));

describe("checkMobileSiteAccess", () => {
  let check: typeof import("../mobile-site-access").checkMobileSiteAccess;
  beforeEach(async () => { ({ checkMobileSiteAccess: check } = await import("../mobile-site-access")); });

  it("a member of site A cannot name site B — even with a validly signed token", async () => {
    expect((await check({ method: "GET", orgId: "broberg-ai", siteId: "trail", bearer: "sanne" }))?.status).toBe(403);
  });
  it("a member reaches their own site", async () => {
    expect(await check({ method: "PATCH", orgId: "webhouse", siteId: "sanneandersen", bearer: "sanne" })).toBeNull();
  });
  it("a traversal id is refused before any lookup; an unknown site is 404", async () => {
    expect((await check({ method: "GET", orgId: "..", siteId: "x", bearer: "sanne" }))?.status).toBe(400);
    expect((await check({ method: "GET", orgId: "webhouse", siteId: "nope", bearer: "sanne" }))?.status).toBe(404);
  });
  it("leaves no-site and no-bearer/invalid-bearer requests to the route (which answers 401)", async () => {
    expect(await check({ method: "GET", orgId: null, siteId: null, bearer: "sanne" })).toBeNull();
    expect(await check({ method: "GET", orgId: "webhouse", siteId: "sanneandersen", bearer: null })).toBeNull();
    expect(await check({ method: "GET", orgId: "webhouse", siteId: "sanneandersen", bearer: "bad" })).toBeNull();
  });
});
