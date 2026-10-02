/**
 * F206.4 — POST /api/schema/sync carries `blocks`.
 *
 * A site that builds in its own repo (trail) defines new section types there;
 * this route is the only way they reach the admin. Before F206.4 the route
 * ignored `blocks`, so the types existed in the repo and nowhere the owner
 * could edit them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  config: { collections: [], blocks: [] as Array<Record<string, unknown>> } as Record<string, unknown>,
  writes: [] as Array<{ kind: string; value: unknown }>,
}));

vi.mock("@/lib/cms", () => ({ getAdminConfig: async () => state.config }));
vi.mock("@/lib/site-paths", () => ({ getActiveSitePaths: async () => ({ configPath: "/x/cms.config.ts" }) }));
vi.mock("@/lib/require-role", () => ({ denyViewers: async () => null, getSiteRole: async () => "admin" }));
vi.mock("@/lib/site-config", () => ({ readSiteConfig: async () => ({}) }));
vi.mock("@/lib/site-pool", () => ({ invalidateActiveSite: async () => {} }));
vi.mock("@/lib/chat/quick-prewarm", () => ({ invalidateQuickCacheOnWrite: async () => {} }));
vi.mock("@/lib/config-writer", () => ({
  writeConfigBlocks: async (_p: string, _c: unknown, v: unknown) => { state.writes.push({ kind: "blocks", value: v }); },
  writeConfigCollections: async (_p: string, _c: unknown, v: unknown) => { state.writes.push({ kind: "collections", value: v }); },
  writeConfigForms: async (_p: string, _c: unknown, v: unknown) => { state.writes.push({ kind: "forms", value: v }); },
}));

import { POST } from "../../app/api/schema/sync/route";

function req(body: unknown) {
  return new Request("http://x/api/schema/sync?site=trail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const hero = { name: "hero", fields: [{ name: "title", type: "text" }] };
const stats = { name: "stats", fields: [{ name: "value", type: "text" }] };

beforeEach(() => {
  state.config = { collections: [], blocks: [hero] };
  state.writes = [];
});

describe("POST /api/schema/sync — blocks (F206.4)", () => {
  it("writes a new block and keeps the existing one", async () => {
    const res = await POST(req({ blocks: [stats] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.blocks.added).toEqual(["stats"]);
    expect(state.writes).toEqual([{ kind: "blocks", value: [hero, stats] }]);
  });

  it("an identical re-push writes nothing", async () => {
    const res = await POST(req({ blocks: [hero] }));
    const body = await res.json();
    expect(body.blocks.changed).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("rejects an empty blocks array without writing", async () => {
    const res = await POST(req({ blocks: [] }));
    expect(res.status).toBe(400);
    expect(state.writes).toEqual([]);
  });

  it("rejects a block without a name without writing", async () => {
    const res = await POST(req({ blocks: [{ fields: [] }] }));
    expect(res.status).toBe(400);
    expect(state.writes).toEqual([]);
  });

  it("blocks and collections in one push both land", async () => {
    const pages = { name: "pages", fields: [{ name: "sections", type: "blocks", blocks: ["hero", "stats"] }] };
    const res = await POST(req({ blocks: [hero, stats], collections: [pages] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.blocks.added).toEqual(["stats"]);
    expect(state.writes.map((w) => w.kind)).toEqual(["blocks", "collections"]);
  });
});
