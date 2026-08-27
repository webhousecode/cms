import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The PATCH route must judge required fields on the MERGED document.
 *
 * This is the half `document-schema.test.ts` cannot see. That file proves the
 * RULE tells merged-state and request-body apart; it says nothing about which
 * one the route hands it. Get that wrong and every ordinary edit of a valid
 * published document starts failing — a partial PATCH does not resend the
 * fields it is not changing, so the request alone always looks incomplete.
 *
 * Worth the mocking machinery because the blast radius is every editor on every
 * customer site, and the failure would appear the moment enforcement went live.
 */

const COLLECTION = {
  name: "undervisere",
  fields: [
    { name: "name", label: "Navn", required: true },
    { name: "role", label: "Rolle" },
  ],
};

let stored: Record<string, unknown> = { name: "Sanne", role: "Skoleleder" };
let updateArg: Record<string, unknown> | null = null;

vi.mock("@/lib/cms", () => ({
  getAdminConfig: async () => ({ collections: [COLLECTION], defaultLocale: "da" }),
  getAdminCms: async () => ({
    content: {
      findBySlug: async () => ({ id: "doc1", slug: "sanne", status: "published", data: stored }),
      update: async (_c: string, _id: string, input: Record<string, unknown>) => {
        updateArg = input;
        return { id: "doc1", slug: "sanne", data: input.data };
      },
    },
  }),
}));
vi.mock("@/lib/revisions", () => ({ saveRevision: async () => {} }));
vi.mock("@/lib/curation", () => ({ removeQueueItemsBySlug: async () => {} }));
vi.mock("@/lib/revalidation", () => ({ dispatchRevalidation: async () => ({ status: "ok" }) }));
vi.mock("@/lib/site-paths", () => ({ getActiveSiteEntry: async () => ({ id: "s", adapter: "filesystem" }) }));
vi.mock("@/lib/require-role", () => ({
  getSiteRole: async () => "admin",
  getSessionWithSiteRole: async () => ({ siteRole: "admin", userId: "u", name: "N", email: "e@x.dk" }),
}));
vi.mock("@/lib/webhook-events", () => ({ fireContentEvent: async () => {} }));
vi.mock("@/lib/site-context", () => ({ withSiteContext: async (_c: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/site-registry", () => ({ loadRegistry: async () => ({ orgs: [] }), findSite: () => null }));
vi.mock("@/lib/cors-origin", () => ({ originAllowed: () => true, siteOrigins: () => [] }));
vi.mock("@/lib/upmetrics-server", () => ({ serverError: (_e: unknown, _m: unknown, i: { headers?: HeadersInit }) => new Response("err", { status: 500, ...i }) }));
vi.mock("@/lib/chat/quick-prewarm", () => ({ invalidateQuickCacheOnWrite: async () => {} }));
vi.mock("@webhouse/cms", () => ({ GitHubStorageAdapter: class {} }));

const { PATCH } = await import("@/app/api/cms/[collection]/[slug]/route");

const patch = async (body: unknown) => {
  const req = new Request("https://webhouse.app/api/cms/undervisere/sanne", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  req.nextUrl = new URL("https://webhouse.app/api/cms/undervisere/sanne");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (PATCH as any)(req, { params: Promise.resolve({ collection: "undervisere", slug: "sanne" }) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

beforeEach(() => {
  stored = { name: "Sanne", role: "Skoleleder" };
  updateArg = null;
});

describe("PATCH judges the merged document, not the request", () => {
  it("accepts a partial edit that does not resend the required field", async () => {
    // THE CASE THAT BREAKS EVERYTHING IF JUDGED ON THE REQUEST: `name` is
    // required and absent from this body, but present on the stored document.
    const r = await patch({ data: { role: "Underviser" } });
    expect(r.status).toBe(200);
    expect(updateArg).not.toBeNull();
  });

  it("rejects a patch that EMPTIES the required field", async () => {
    const r = await patch({ data: { name: "" } });
    expect(r.status).toBe(400);
    expect(String(r.body?.error)).toContain("Navn");
    expect(updateArg, "wrote anyway — the check must run BEFORE the write").toBeNull();
  });

  it("lets a draft through with the required field empty", async () => {
    const r = await patch({ data: { name: "" }, status: "draft" });
    expect(r.status).toBe(200);
  });

  it("rejects publishing a document whose required field is empty", async () => {
    stored = { name: "", role: "x" };
    const r = await patch({ status: "published" });
    expect(r.status).toBe(400);
  });
});
