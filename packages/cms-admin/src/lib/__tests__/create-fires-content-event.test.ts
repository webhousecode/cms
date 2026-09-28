import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A document CREATED through the API must fire the F35 content webhook, like a
 * PATCH does. It did not: POST /api/cms/<collection> saved, revalidated and
 * returned 201 — and never told the site's content webhooks anything.
 *
 * Found 28/9-2026 when Christian asked why broberg.ai's new Mailworker page
 * never reached Trail. broberg.ai pushes a page to Trail from its
 * contentWebhooks subscription (/api/trail-ingest); the page had been created
 * published in one call, so the webhook that feeds Trail never fired.
 */

const COLLECTION = { name: "platforms", fields: [{ name: "name" }] };
const events: Array<{ action: string; collection: string; slug: string }> = [];

vi.mock("@/lib/cms", () => ({
  getAdminConfig: async () => ({ collections: [COLLECTION], defaultLocale: "da" }),
  getAdminCms: async () => ({
    content: {
      create: async (_c: string, input: { slug: string; data: unknown; status: string }) => ({
        id: "doc1", slug: input.slug, status: input.status, data: input.data,
      }),
    },
  }),
}));
vi.mock("@/lib/revisions", () => ({ saveRevision: async () => {} }));
vi.mock("@/lib/revalidation", () => ({ dispatchRevalidation: async () => ({ ok: true }) }));
vi.mock("@/lib/site-paths", () => ({ getActiveSiteEntry: async () => ({ id: "s", adapter: "filesystem" }) }));
vi.mock("@/lib/require-role", () => ({
  getSiteRole: async () => "admin",
  getSessionWithSiteRole: async () => ({ siteRole: "admin", userId: "u", name: "N", email: "e@x.dk" }),
}));
vi.mock("@/lib/webhook-events", () => ({
  fireContentEvent: async (action: string, collection: string, slug: string) => {
    events.push({ action, collection, slug });
  },
}));
vi.mock("@/lib/site-context", () => ({ withSiteContext: async (_c: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/site-registry", () => ({ loadRegistry: async () => ({ orgs: [] }), findSite: () => null }));
vi.mock("@/lib/site-config", () => ({ readSiteConfig: async () => ({ deployOnSave: false }) }));
vi.mock("@/lib/event-log", () => ({ logDocumentCreated: async () => {} }));
vi.mock("@/lib/chat/quick-prewarm", () => ({ invalidateQuickCacheOnWrite: async () => {} }));

const { POST } = await import("@/app/api/cms/[collection]/route");
const { NextRequest } = await import("next/server");

const create = (body: unknown) =>
  POST(
    new NextRequest("https://webhouse.app/api/cms/platforms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ collection: "platforms" }) } as never,
  );

describe("POST /api/cms/<collection> fires the F35 content webhook", () => {
  beforeEach(() => { events.length = 0; });

  it("a document created PUBLISHED fires «published» — the event Trail-ingest listens for", async () => {
    const res = await create({ slug: "mailworker", status: "published", data: { name: "mailworker" } });
    expect(res.status).toBe(201);
    expect(events).toEqual([{ action: "published", collection: "platforms", slug: "mailworker" }]);
  });

  it("a DRAFT fires «created», not «published» — nothing goes live, nothing is pushed", async () => {
    const res = await create({ slug: "udkast", data: { name: "x" } });
    expect(res.status).toBe(201);
    expect(events).toEqual([{ action: "created", collection: "platforms", slug: "udkast" }]);
  });
});
