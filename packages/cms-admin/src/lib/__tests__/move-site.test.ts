/**
 * F84 Move Site to Other Organization — Test Suite
 *
 * Tests the moveSite() function: registry manipulation, edge cases, safety.
 * Written BEFORE implementation (TDD).
 *
 * Run: cd packages/cms-admin && npx vitest run src/lib/__tests__/move-site.test.ts
 */
import { describe, it, expect } from "vitest";

// ── Types (mirrors site-registry.ts) ─────────────────────────

interface SiteEntry {
  id: string;
  name: string;
  adapter: "filesystem" | "github";
  configPath: string;
  contentDir?: string;
  uploadDir?: string;
  previewUrl?: string;
  revalidateUrl?: string;
  revalidateSecret?: string;
}

interface OrgEntry {
  id: string;
  name: string;
  type?: string;
  plan?: string;
  sites: SiteEntry[];
}

interface Registry {
  orgs: OrgEntry[];
  defaultOrgId: string;
  defaultSiteId: string;
}

// ── Function under test (pure, no I/O) ──────────────────────

/**
 * Move a site from one org to another in the registry.
 * Returns the mutated registry (same reference).
 * Throws on invalid input.
 */
function moveSite(registry: Registry, siteId: string, fromOrgId: string, toOrgId: string): Registry {
  if (fromOrgId === toOrgId) throw new Error("Source and target org are the same");

  const fromOrg = registry.orgs.find((o) => o.id === fromOrgId);
  if (!fromOrg) throw new Error(`Source org "${fromOrgId}" not found`);

  const toOrg = registry.orgs.find((o) => o.id === toOrgId);
  if (!toOrg) throw new Error(`Target org "${toOrgId}" not found`);

  const siteIdx = fromOrg.sites.findIndex((s) => s.id === siteId);
  if (siteIdx === -1) throw new Error(`Site "${siteId}" not found in org "${fromOrgId}"`);

  // Check for duplicate ID in target org
  if (toOrg.sites.some((s) => s.id === siteId)) {
    throw new Error(`Site "${siteId}" already exists in org "${toOrgId}"`);
  }

  // Atomic move
  const [site] = fromOrg.sites.splice(siteIdx, 1);
  toOrg.sites.push(site);

  // Update defaults if the moved site was the default
  if (registry.defaultSiteId === siteId && registry.defaultOrgId === fromOrgId) {
    registry.defaultOrgId = toOrgId;
  }

  return registry;
}

// ── Fixtures ─────────────────────────────────────────────────

function makeRegistry(): Registry {
  return {
    orgs: [
      {
        id: "webhouse", name: "WebHouse", type: "company",
        sites: [
          { id: "webhouse-site", name: "WebHouse Site", adapter: "filesystem", configPath: "/path/cms.config.ts", contentDir: "/path/content", uploadDir: "/path/uploads", previewUrl: "http://localhost:3009" },
          { id: "boutique", name: "Boutique", adapter: "filesystem", configPath: "/path2/cms.config.ts" },
          { id: "sproutlake", name: "SproutLake", adapter: "github", configPath: "github://cbroberg/sproutlake/cms.config.ts" },
        ],
      },
      {
        id: "aallm", name: "AALLM",
        sites: [
          { id: "blog", name: "Thinking in Pixels", adapter: "filesystem", configPath: "/path3/cms.config.ts" },
        ],
      },
      {
        id: "empty-org", name: "Empty Org",
        sites: [],
      },
    ],
    defaultOrgId: "webhouse",
    defaultSiteId: "webhouse-site",
  };
}

// ── Test Suite ───────────────────────────────────────────────

describe("F84 — moveSite basic operations", () => {
  it("moves a site from one org to another", () => {
    const reg = makeRegistry();
    moveSite(reg, "boutique", "webhouse", "aallm");

    const webhouse = reg.orgs.find((o) => o.id === "webhouse")!;
    const aallm = reg.orgs.find((o) => o.id === "aallm")!;

    expect(webhouse.sites.map((s) => s.id)).not.toContain("boutique");
    expect(aallm.sites.map((s) => s.id)).toContain("boutique");
    expect(aallm.sites).toHaveLength(2); // blog + boutique
    expect(webhouse.sites).toHaveLength(2); // webhouse-site + sproutlake
  });

  it("preserves all site properties after move", () => {
    const reg = makeRegistry();
    const originalSite = { ...reg.orgs[0].sites[0] }; // webhouse-site with all fields
    moveSite(reg, "webhouse-site", "webhouse", "aallm");

    const movedSite = reg.orgs.find((o) => o.id === "aallm")!.sites.find((s) => s.id === "webhouse-site")!;
    expect(movedSite.name).toBe(originalSite.name);
    expect(movedSite.adapter).toBe(originalSite.adapter);
    expect(movedSite.configPath).toBe(originalSite.configPath);
    expect(movedSite.contentDir).toBe(originalSite.contentDir);
    expect(movedSite.uploadDir).toBe(originalSite.uploadDir);
    expect(movedSite.previewUrl).toBe(originalSite.previewUrl);
  });

  it("moves GitHub-backed site preserving github config", () => {
    const reg = makeRegistry();
    moveSite(reg, "sproutlake", "webhouse", "aallm");

    const movedSite = reg.orgs.find((o) => o.id === "aallm")!.sites.find((s) => s.id === "sproutlake")!;
    expect(movedSite.adapter).toBe("github");
    expect(movedSite.configPath).toBe("github://cbroberg/sproutlake/cms.config.ts");
  });

  it("can move site to empty org", () => {
    const reg = makeRegistry();
    moveSite(reg, "boutique", "webhouse", "empty-org");

    const emptyOrg = reg.orgs.find((o) => o.id === "empty-org")!;
    expect(emptyOrg.sites).toHaveLength(1);
    expect(emptyOrg.sites[0].id).toBe("boutique");
  });

  it("source org can become empty after move", () => {
    const reg = makeRegistry();
    moveSite(reg, "blog", "aallm", "webhouse");

    const aallm = reg.orgs.find((o) => o.id === "aallm")!;
    expect(aallm.sites).toHaveLength(0);
  });
});

describe("F84 — default org/site handling", () => {
  it("updates defaultOrgId when default site is moved", () => {
    const reg = makeRegistry();
    expect(reg.defaultOrgId).toBe("webhouse");
    expect(reg.defaultSiteId).toBe("webhouse-site");

    moveSite(reg, "webhouse-site", "webhouse", "aallm");

    expect(reg.defaultOrgId).toBe("aallm"); // updated to follow the site
    expect(reg.defaultSiteId).toBe("webhouse-site"); // unchanged
  });

  it("does NOT change defaults when non-default site is moved", () => {
    const reg = makeRegistry();
    moveSite(reg, "boutique", "webhouse", "aallm");

    expect(reg.defaultOrgId).toBe("webhouse"); // unchanged
    expect(reg.defaultSiteId).toBe("webhouse-site"); // unchanged
  });
});

describe("F84 — error handling", () => {
  it("throws when source and target org are the same", () => {
    const reg = makeRegistry();
    expect(() => moveSite(reg, "boutique", "webhouse", "webhouse"))
      .toThrow("Source and target org are the same");
  });

  it("throws when source org does not exist", () => {
    const reg = makeRegistry();
    expect(() => moveSite(reg, "boutique", "nonexistent", "aallm"))
      .toThrow('Source org "nonexistent" not found');
  });

  it("throws when target org does not exist", () => {
    const reg = makeRegistry();
    expect(() => moveSite(reg, "boutique", "webhouse", "nonexistent"))
      .toThrow('Target org "nonexistent" not found');
  });

  it("throws when site does not exist in source org", () => {
    const reg = makeRegistry();
    expect(() => moveSite(reg, "nonexistent-site", "webhouse", "aallm"))
      .toThrow('Site "nonexistent-site" not found in org "webhouse"');
  });

  it("throws when target org already has site with same ID", () => {
    const reg = makeRegistry();
    // Add a site with id "boutique" to aallm first
    reg.orgs.find((o) => o.id === "aallm")!.sites.push({
      id: "boutique", name: "Another Boutique", adapter: "filesystem", configPath: "/other/path",
    });

    expect(() => moveSite(reg, "boutique", "webhouse", "aallm"))
      .toThrow('Site "boutique" already exists in org "aallm"');

    // Verify source org still has the site (no partial mutation)
    const webhouse = reg.orgs.find((o) => o.id === "webhouse")!;
    expect(webhouse.sites.map((s) => s.id)).toContain("boutique");
  });

  it("does not mutate registry on error", () => {
    const reg = makeRegistry();
    const originalSiteCount = reg.orgs.find((o) => o.id === "webhouse")!.sites.length;

    try { moveSite(reg, "boutique", "webhouse", "webhouse"); } catch { /* expected */ }

    // Registry unchanged
    expect(reg.orgs.find((o) => o.id === "webhouse")!.sites.length).toBe(originalSiteCount);
  });
});

describe("F84 — multiple moves", () => {
  it("can move a site twice (A → B → C)", () => {
    const reg = makeRegistry();
    moveSite(reg, "boutique", "webhouse", "aallm");
    moveSite(reg, "boutique", "aallm", "empty-org");

    expect(reg.orgs.find((o) => o.id === "webhouse")!.sites.map((s) => s.id)).not.toContain("boutique");
    expect(reg.orgs.find((o) => o.id === "aallm")!.sites.map((s) => s.id)).not.toContain("boutique");
    expect(reg.orgs.find((o) => o.id === "empty-org")!.sites.map((s) => s.id)).toContain("boutique");
  });

  it("can move a site back to original org", () => {
    const reg = makeRegistry();
    moveSite(reg, "boutique", "webhouse", "aallm");
    moveSite(reg, "boutique", "aallm", "webhouse");

    expect(reg.orgs.find((o) => o.id === "webhouse")!.sites.map((s) => s.id)).toContain("boutique");
    expect(reg.orgs.find((o) => o.id === "aallm")!.sites.map((s) => s.id)).not.toContain("boutique");
  });
});
