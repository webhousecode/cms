/**
 * Cross-site team membership lookups.
 *
 * Used when we need to check access across ALL sites (e.g. for redirecting
 * a user to a site they DO have access to, or filtering the site-switcher).
 */
import fs from "fs/promises";
import path from "path";
import { loadRegistry } from "./site-registry";

interface TeamMember {
  userId: string;
  role: string;
}

function getSiteDataDir(site: { id: string; adapter?: string; configPath: string; contentDir?: string }): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (site.adapter === "github" || site.configPath.startsWith("github://")) {
    const cacheBase = configPath
      ? path.join(path.dirname(path.resolve(configPath)), ".cache")
      : path.join(process.env.HOME ?? "/tmp", ".webhouse", ".cache");
    return path.join(cacheBase, "sites", site.id, "_data");
  }
  const abs = path.resolve(site.configPath);
  const projDir = path.dirname(abs);
  const contentDir = site.contentDir ?? path.join(projDir, "content");
  return path.join(contentDir, "..", "_data");
}

/**
 * Find the first site the user has team membership on.
 * Returns { orgId, siteId } or null.
 */
export async function findFirstAccessibleSite(userId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null; // single-site mode — access is implicit

  for (const org of registry.orgs) {
    for (const site of org.sites) {
      const dataDir = getSiteDataDir(site);
      try {
        const content = await fs.readFile(path.join(dataDir, "team.json"), "utf-8");
        const members = JSON.parse(content) as TeamMember[];
        if (members.some((m) => m.userId === userId)) {
          return { orgId: org.id, siteId: site.id };
        }
      } catch { /* no team.json = no access */ }
    }
  }
  return null;
}

/**
 * Get all site IDs where the user is a team member.
 */
export async function getAccessibleSiteIds(userId: string): Promise<string[]> {
  const registry = await loadRegistry();
  if (!registry) return ["__single__"];

  const ids: string[] = [];
  for (const org of registry.orgs) {
    for (const site of org.sites) {
      const dataDir = getSiteDataDir(site);
      try {
        const content = await fs.readFile(path.join(dataDir, "team.json"), "utf-8");
        const members = JSON.parse(content) as TeamMember[];
        if (members.some((m) => m.userId === userId)) {
          ids.push(site.id);
        }
      } catch { /* no team.json = no access */ }
    }
  }
  return ids;
}
