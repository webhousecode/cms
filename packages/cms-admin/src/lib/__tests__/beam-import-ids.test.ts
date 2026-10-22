/**
 * Security W41 NY-K2 — a .beam archive names its own site id, which becomes
 * beam-sites/<id> and is rm -rf'd on overwrite. ".." pointed that at the whole
 * admin data dir; another tenant's id pointed it at their site.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

const removed: string[] = [];
vi.mock("node:fs", async (orig) => {
  const real = await orig<typeof import("node:fs")>();
  return { ...real, rmSync: (p: string) => { removed.push(p); }, mkdirSync: () => undefined, writeFileSync: () => undefined };
});
vi.mock("../beam/paths", () => ({ getBeamSitesDir: async () => "/data/cms-admin/beam-sites" }));
vi.mock("../site-registry", () => ({
  loadRegistry: async () => ({ orgs: [{ id: "webhouse", sites: [{ id: "sanneandersen" }] }, { id: "evil-org", sites: [] }] }),
  findSite: (r: { orgs: { id: string; sites: { id: string }[] }[] }, o: string, s: string) => r.orgs.find((x) => x.id === o)?.sites.find((x) => x.id === s) ?? null,
  addSite: async () => {},
}));

async function archive(siteId: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify({ version: 1, site: { id: siteId, name: "x" }, stats: {} }));
  return zip.generateAsync({ type: "nodebuffer" });
}

beforeEach(() => { removed.length = 0; });

describe("importBeamArchive refuses an archive-chosen id that escapes or crosses tenants", () => {
  it.each(["..", "../users", "a/b", ""])("site id %j", async (id) => {
    const { importBeamArchive } = await import("../beam/import");
    await expect(importBeamArchive(await archive(id), "evil-org", { overwrite: true })).rejects.toThrow(/Invalid site id/);
    expect(removed).toEqual([]);
  });

  it("another org's site id, even with overwrite", async () => {
    const { importBeamArchive } = await import("../beam/import");
    await expect(importBeamArchive(await archive("sanneandersen"), "evil-org", { overwrite: true })).rejects.toThrow(/another organization/);
    expect(removed).toEqual([]);
  });
});
