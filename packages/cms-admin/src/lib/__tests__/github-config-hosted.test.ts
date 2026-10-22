/**
 * Security W41 NY-H3 — a github:// cms.config.ts is the site's own code; on a
 * server that runs no site code it must not reach jiti (or even be fetched).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const fetched: string[] = [];
vi.stubGlobal("fetch", vi.fn(async (u: string) => { fetched.push(String(u)); return new Response("export default {}"); }));
afterEach(() => { vi.unstubAllEnvs(); fetched.length = 0; });

describe("GitHub-backed config on a hosted server", () => {
  it("is refused before anything is fetched or run", async () => {
    vi.stubEnv("CMS_SERVER_BUILDS", "off");
    const { loadGitHubConfig } = await import("../site-pool");
    const site = { id: "gh", name: "gh", adapter: "github", configPath: "github://o/r/cms.config.ts", github: { owner: "o", repo: "r", token: "t" } };
    await expect(loadGitHubConfig(site as never)).rejects.toThrow(/does not run a site's cms.config.ts from GitHub/);
    expect(fetched).toEqual([]);
  });
});
