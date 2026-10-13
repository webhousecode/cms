/**
 * F208 — three cross-site holes found by components' tenant survey (#39275).
 * None was live on prod (13 Oct 2026), each one ordinary action away from it.
 *
 * 1. resolveToken("oauth") borrowed ANOTHER site's GitHub token, or the
 *    installation-wide one, when the active site had none.
 * 2. GET /api/cms/registry treated a session whose user is gone from
 *    users.json as admin and returned every org and site.
 * 3. Site ids were unique per org only, and cross-org lookups took the first
 *    match — while GitHub sites key their data dir (team.json, token) on the
 *    id alone, so two orgs with one id would share both.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
  }),
}));

let activeDataDir = "";
vi.mock("../site-paths", () => ({
  getActiveSitePaths: async () => ({ dataDir: activeDataDir }),
}));

const twoOrgs = (siteInB: string) => ({
  orgs: [
    { id: "org-a", name: "A", sites: [{ id: "shared", name: "S", adapter: "filesystem", configPath: "/x/cms.config.ts" }] },
    { id: "org-b", name: "B", sites: [{ id: siteInB, name: "T", adapter: "filesystem", configPath: "/y/cms.config.ts" }] },
  ],
  defaultOrgId: "org-a",
  defaultSiteId: "shared",
});

describe("F208 cross-site holes", () => {
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    cookieJar.clear();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "f208-"));
    vi.stubEnv("WEBHOUSE_DATA_DIR", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("1 · resolveToken('oauth') never borrows another site's token", () => {
    async function writeToken(dataDir: string, token: string) {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(path.join(dataDir, "github-service-token.json"), JSON.stringify({ token }));
    }

    it("refuses when only ANOTHER site and the installation hold a token", async () => {
      activeDataDir = path.join(dir, "sites", "mine", "_data");
      await fs.mkdir(activeDataDir, { recursive: true });
      vi.stubEnv("CMS_CONFIG_PATH", path.join(dir, "cms.config.ts"));
      await writeToken(path.join(dir, ".cache", "sites", "someone-else", "_data"), "ghp_OTHER_SITE");
      await writeToken(path.join(dir, "_data"), "ghp_INSTALLATION");

      const { resolveToken } = await import("../site-pool");
      await expect(resolveToken("oauth")).rejects.toThrow(/GitHub not connected/);
    });

    it("uses the ACTIVE site's own service token", async () => {
      activeDataDir = path.join(dir, "sites", "mine", "_data");
      await writeToken(activeDataDir, "ghp_MINE");
      const { resolveToken } = await import("../site-pool");
      expect(await resolveToken("oauth")).toBe("ghp_MINE");
    });

    it("still prefers the user's own OAuth cookie", async () => {
      activeDataDir = path.join(dir, "sites", "mine", "_data");
      cookieJar.set("github-token", "gho_USER");
      const { resolveToken } = await import("../site-pool");
      expect(await resolveToken("oauth")).toBe("gho_USER");
    });
  });

  describe("3 · site ids are globally unique", () => {
    it("findSiteOrgId resolves a unique id and refuses an ambiguous one", async () => {
      const { findSiteOrgId } = await import("../site-registry");
      expect(findSiteOrgId(twoOrgs("other") as never, "shared")).toBe("org-a");
      expect(findSiteOrgId(twoOrgs("other") as never, "other")).toBe("org-b");
      expect(findSiteOrgId(twoOrgs("shared") as never, "shared")).toBeNull();
      expect(findSiteOrgId(twoOrgs("other") as never, "nope")).toBeNull();
    });

    it("addSite refuses an id that already exists in a DIFFERENT org", async () => {
      await fs.writeFile(path.join(dir, "registry.json"), JSON.stringify(twoOrgs("other")));
      const { addSite, loadRegistry } = await import("../site-registry");
      await expect(
        addSite("org-b", { id: "shared", name: "Dup", adapter: "filesystem", configPath: "/z/cms.config.ts" } as never),
      ).rejects.toThrow(/already exists/);
      const reg = await loadRegistry();
      expect(reg!.orgs[1]!.sites.map((s) => s.id)).toEqual(["other"]);
    });

    it("addSite in the SAME org stays a no-op (beam overwrite path relies on it)", async () => {
      await fs.writeFile(path.join(dir, "registry.json"), JSON.stringify(twoOrgs("other")));
      const { addSite, loadRegistry } = await import("../site-registry");
      await addSite("org-a", { id: "shared", name: "Again", adapter: "filesystem", configPath: "/x/cms.config.ts" } as never);
      const reg = await loadRegistry();
      expect(reg!.orgs[0]!.sites.map((s) => s.name)).toEqual(["S"]);
    });
  });
});

describe("F208 registry route", () => {
  let dir: string;

  beforeEach(async () => {
    vi.resetModules();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "f208r-"));
    vi.stubEnv("WEBHOUSE_DATA_DIR", dir);
    await fs.writeFile(path.join(dir, "registry.json"), JSON.stringify(twoOrgs("other")));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth");
    vi.doUnmock("@/lib/permissions");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("2 · GET refuses a session whose user no longer exists — never the whole registry", async () => {
    vi.doMock("@/lib/auth", () => ({
      getSessionUser: async () => ({ sub: "deleted-user", id: "deleted-user", email: "x@y.z" }),
      getUsers: async () => [],
    }));
    const { GET } = await import("../../app/api/cms/registry/route");
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.registry).toBeUndefined();
  });

  it("3 · POST add-site answers 409 for an existing id and leaves the site's team.json alone", async () => {
    const projDir = path.join(dir, "proj");
    const teamFile = path.join(projDir, "_data", "team.json");
    await fs.mkdir(path.dirname(teamFile), { recursive: true });
    const team = JSON.stringify([{ userId: "owner", role: "admin" }, { userId: "editor", role: "editor" }]);
    await fs.writeFile(teamFile, team);

    vi.doMock("@/lib/permissions", () => ({ requirePermission: async () => null }));
    vi.doMock("@/lib/auth", () => ({
      getSessionUser: async () => ({ sub: "attacker", id: "attacker", email: "a@b.c" }),
      getUsers: async () => [],
    }));
    const { POST } = await import("../../app/api/cms/registry/route");
    const req = new Request("http://x/api/cms/registry", {
      method: "POST",
      body: JSON.stringify({
        action: "add-site",
        orgId: "org-b",
        site: { id: "shared", name: "Dup", adapter: "filesystem", configPath: path.join(projDir, "cms.config.ts") },
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(409);
    expect(await fs.readFile(teamFile, "utf-8")).toBe(team);
  });
});
