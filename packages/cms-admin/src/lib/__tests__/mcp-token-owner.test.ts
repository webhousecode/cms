/**
 * Security W41 NY-H2 — /api/mcp/admin skipped every token rule: a customer's
 * "*" token with no site list got admin MCP on the registry's DEFAULT site.
 */
import { describe, it, expect, vi } from "vitest";

const tokens: Record<string, unknown> = {
  wh_customer: { id: "c", name: "c", hash: "h", userId: "customer", createdAt: "2026-01-01", permissions: ["*"], resources: [], ipFilters: [] },
  wh_owner: { id: "o", name: "o", hash: "h", userId: "owner", createdAt: "2026-01-01", permissions: ["*"], resources: [], ipFilters: [] },
  wh_expired: { id: "e", name: "e", hash: "h", userId: "owner", createdAt: "2026-01-01", permissions: ["*"], resources: [], ipFilters: [], notAfter: "2020-01-01T00:00:00Z" },
};
vi.mock("../access-tokens", async (orig) => ({ ...(await orig<typeof import("../access-tokens")>()), verifyAccessToken: async (t: string) => tokens[t] ?? null }));
vi.mock("../site-registry", () => ({ loadRegistry: async () => ({ orgs: [{ id: "webhouse", sites: [{ id: "webhouse-site" }] }], defaultOrgId: "webhouse", defaultSiteId: "webhouse-site" }) }));
vi.mock("../auth", () => ({ getUsers: async () => [{ id: "owner", role: "admin" }, { id: "customer", role: "editor" }] }));
vi.mock("../team", () => ({ getTeamMembersForSite: async () => [{ userId: "owner", role: "admin" }] }));

describe("resolveApiKeyToSite (MCP admin door)", () => {
  it("refuses a customer's site-less token instead of binding it to the default site", async () => {
    const { resolveApiKeyToSite } = await import("../mcp-config");
    expect(await resolveApiKeyToSite("Bearer wh_customer")).toBeNull();
  });
  it("refuses an expired token", async () => {
    const { resolveApiKeyToSite } = await import("../mcp-config");
    expect(await resolveApiKeyToSite("Bearer wh_expired")).toBeNull();
  });
  it("the instance admin's token still binds", async () => {
    const { resolveApiKeyToSite } = await import("../mcp-config");
    expect((await resolveApiKeyToSite("Bearer wh_owner"))?.siteId).toBe("webhouse-site");
  });
});
