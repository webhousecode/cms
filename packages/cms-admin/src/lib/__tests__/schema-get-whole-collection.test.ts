import { describe, it, expect, vi } from "vitest";

/**
 * A collection must come back whole.
 *
 * GET /api/schema used to hand-pick four properties:
 *
 *     { name, label, urlPrefix, fields }
 *
 * Everything else was dropped without a word. Measured against production on
 * 27 Aug 2026 while syncing a new collection to sanneandersen for its owner:
 * `kind`, `sourceLocale` and the editor-facing `description` were written
 * correctly into cms.config.ts and were absent from this response. The peer
 * session that was going to verify the sync would have read the answer and
 * concluded it had failed.
 *
 * The route cannot say "I don't know about that property" — it answers as
 * though the collection had nothing more, which is the same confident shape as
 * a mail that reports "sent" without sending.
 *
 * THE ASSERTION THAT MATTERS uses a property this route has NEVER known about.
 * Testing with `kind` or `description` would pass again the moment someone adds
 * them to a new hand-picked list — it would prove the list has six entries, not
 * that the collection is whole. So the fixture carries a made-up property, and
 * the contract under test is "whatever is on the collection reaches the caller".
 */

const CONFIG = {
  collections: [
    {
      name: "undervisere",
      label: "Uddannelse — undervisere",
      // The three that actually went missing.
      kind: "data",
      sourceLocale: "da",
      description: "Underviserne på zoneterapeut-uddannelsen.",
      // Properties the route knew about, which must still survive.
      urlPrefix: "/undervisere",
      fields: [{ name: "name", type: "text", label: "Navn", required: true }],
      // A property that did not exist when this route was written and does not
      // exist now. Nobody can have allow-listed it. If this survives, the route
      // is passing the object through rather than rebuilding it.
      aPropertyNobodyHasAllowlisted: { nested: ["deep", "value"] },
    },
  ],
};

vi.mock("@/lib/cms", () => ({ getAdminConfig: async () => CONFIG }));
vi.mock("@/lib/site-config", () => ({ readSiteConfig: async () => ({ schemaEditEnabled: false }) }));

let role: string | null = "admin";
vi.mock("@/lib/require-role", () => ({ getSiteRole: async () => role }));

const { GET } = await import("@/app/api/schema/route");

const read = async () => {
  const res = await GET();
  return { status: res.status, body: await res.json() };
};

describe("GET /api/schema returns the whole collection", () => {
  it("passes through a property the route has never heard of", async () => {
    role = "admin";
    const { body } = await read();
    expect(body.collections[0].aPropertyNobodyHasAllowlisted).toEqual({
      nested: ["deep", "value"],
    });
  });

  it("includes the three that actually went missing in production", async () => {
    role = "admin";
    const c = (await read()).body.collections[0];
    expect(c.kind).toBe("data");
    expect(c.sourceLocale).toBe("da");
    expect(c.description).toBe("Underviserne på zoneterapeut-uddannelsen.");
  });

  it("still returns what it always returned", async () => {
    // The regression guard on the other side: passing everything through must
    // not quietly change or drop what callers already depend on.
    role = "admin";
    const c = (await read()).body.collections[0];
    expect(c.name).toBe("undervisere");
    expect(c.label).toBe("Uddannelse — undervisere");
    expect(c.urlPrefix).toBe("/undervisere");
    expect(c.fields).toEqual([
      { name: "name", type: "text", label: "Navn", required: true },
    ]);
  });

  it("leaks no filesystem path and no secret", async () => {
    // Returning MORE means being sure about what more is. Asserted rather than
    // assumed, because "just pass the object through" is exactly the change
    // that could carry something internal out with it.
    role = "admin";
    const raw = JSON.stringify((await read()).body);
    expect(raw).not.toMatch(/\/data\/|\/Users\/|\/home\//);
    expect(raw).not.toMatch(/secret|apiKey|api_key|token|password/i);
  });
});

describe("the access gate is unchanged", () => {
  it("answers an admin", async () => {
    role = "admin";
    expect((await read()).status).toBe(200);
  });

  it("refuses a non-admin while schema editing is off", async () => {
    // NEGATIVE CONTROL — without it, "an admin gets the whole collection" would
    // also pass on a route that had stopped gating altogether.
    role = "editor";
    const { status, body } = await read();
    expect(status).toBe(403);
    expect(body.error).toBe("Schema editing disabled");
  });
});
