/**
 * Regression test for the 2026-06-25 broberg-ai incident: a site added to the
 * registry at runtime 404'd in the /admin/{slug} site router until the machine
 * was restarted, because Next.js middleware and route handlers run as separate
 * module instances with separate in-memory registry caches. loadRegistry() now
 * invalidates its cache when registry.json's mtime changes on disk, so a write
 * through ANY instance surfaces in EVERY instance on the next request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

describe("loadRegistry — mtime-based cache invalidation", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "reg-cache-"));
    vi.stubEnv("WEBHOUSE_DATA_DIR", dir);
    // The cache only engages in production — exercise that exact path.
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reloads when registry.json changes on disk — no restart needed", async () => {
    const { loadRegistry } = await import("../site-registry");
    const regPath = path.join(dir, "registry.json");

    const v1 = {
      orgs: [{ id: "org1", name: "Org1", sites: [{ id: "site-a", name: "A", adapter: "filesystem" }] }],
      defaultOrgId: "org1",
      defaultSiteId: "site-a",
    };
    await fs.writeFile(regPath, JSON.stringify(v1));
    const r1 = await loadRegistry();
    expect(r1?.orgs[0]?.sites.map((s) => s.id)).toEqual(["site-a"]);

    // Simulate ANOTHER module instance (a route handler) adding a site: new
    // file content + a deterministically newer mtime.
    const v2 = {
      ...v1,
      orgs: [{ ...v1.orgs[0], sites: [...v1.orgs[0].sites, { id: "site-b", name: "B", adapter: "filesystem" }] }],
    };
    await fs.writeFile(regPath, JSON.stringify(v2));
    const future = new Date(Date.now() + 5000);
    await fs.utimes(regPath, future, future);

    const r2 = await loadRegistry();
    // Before the fix this returned the stale ["site-a"] from the in-memory cache.
    expect(r2?.orgs[0]?.sites.map((s) => s.id)).toEqual(["site-a", "site-b"]);
  });

  it("serves the cache while the file is unchanged (no needless re-parse)", async () => {
    const { loadRegistry } = await import("../site-registry");
    const regPath = path.join(dir, "registry.json");
    const v1 = {
      orgs: [{ id: "org1", name: "Org1", sites: [{ id: "site-a", name: "A", adapter: "filesystem" }] }],
      defaultOrgId: "org1",
      defaultSiteId: "site-a",
    };
    await fs.writeFile(regPath, JSON.stringify(v1));

    // Two reads with no write in between: the second must return the SAME cached
    // object (mtime unchanged → served from cache, not re-parsed from disk).
    const r1 = await loadRegistry();
    const r2 = await loadRegistry();
    expect(r2).toBe(r1);
    expect(r2?.orgs[0]?.sites.map((s) => s.id)).toEqual(["site-a"]);
  });
});
