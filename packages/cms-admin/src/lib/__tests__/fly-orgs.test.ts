/**
 * F200.3 — the deploy wizard verifies a Fly token through @broberg/deploy-core.
 * FlyClient takes an injected fetch, so these run against Fly's real response
 * shapes without the network.
 */
import { describe, it, expect } from "vitest";
import { listFlyOrgsForToken } from "../deploy/fly-orgs";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async (url: string | URL) => {
    expect(String(url)).toContain("fly.io");
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const orgsBody = (nodes: unknown[]) => ({ data: { organizations: { nodes } } });

describe("listFlyOrgsForToken", () => {
  it("returns the orgs a valid token can see", async () => {
    const r = await listFlyOrgsForToken(
      "tok",
      fakeFetch(200, orgsBody([{ id: "1", slug: "personal", name: "Personal", type: "PERSONAL" }])),
    );
    expect(r).toEqual({ ok: true, orgs: [{ slug: "personal", name: "Personal" }] });
  });

  it("treats an empty org list as a failure, never a green verify", async () => {
    const r = await listFlyOrgsForToken("tok", fakeFetch(200, orgsBody([])));
    expect(r).toEqual({ ok: false, status: 422, error: "No organizations found for this token" });
  });

  it("turns Fly's 401 into a readable rejection", async () => {
    const r = await listFlyOrgsForToken("bad", fakeFetch(401, { errors: [{ message: "unauthorized" }] }));
    expect(r).toEqual({ ok: false, status: 401, error: "Fly rejected this token" });
  });

  it("refuses an empty token without calling Fly", async () => {
    const r = await listFlyOrgsForToken("  ", (() => { throw new Error("must not call Fly"); }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, status: 400, error: "Missing Fly API token" });
  });
});
