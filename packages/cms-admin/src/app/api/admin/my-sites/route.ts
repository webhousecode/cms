import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { loadRegistry } from "@/lib/site-registry";
import fs from "fs/promises";
import path from "path";

interface TeamMember {
  userId: string;
  role: string;
}

/**
 * Returns only the sites the current user has team membership on.
 * Used by site-switcher to filter the dropdown.
 */
export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) {
    return NextResponse.json({ siteIds: [] });
  }

  const registry = await loadRegistry();
  if (!registry) {
    // Single-site mode — user has access if they're logged in
    return NextResponse.json({ siteIds: ["__single__"] });
  }

  const accessibleSiteIds: string[] = [];

  for (const org of registry.orgs) {
    for (const site of org.sites) {
      // Determine _data dir for this site
      let dataDir: string;
      if (site.adapter === "github" || site.configPath.startsWith("github://")) {
        const configPath = process.env.CMS_CONFIG_PATH;
        const cacheBase = configPath
          ? path.join(path.dirname(path.resolve(configPath)), ".cache")
          : path.join(process.env.HOME ?? "/tmp", ".webhouse", ".cache");
        dataDir = path.join(cacheBase, "sites", site.id, "_data");
      } else {
        const abs = path.resolve(site.configPath);
        const projDir = path.dirname(abs);
        const contentDir = site.contentDir ?? path.join(projDir, "content");
        dataDir = path.join(contentDir, "..", "_data");
      }

      // Read team.json for this site
      try {
        const teamFile = path.join(dataDir, "team.json");
        const content = await fs.readFile(teamFile, "utf-8");
        const members = JSON.parse(content) as TeamMember[];
        if (members.some((m) => m.userId === session.sub)) {
          accessibleSiteIds.push(site.id);
        }
      } catch {
        // No team.json — check if this user is the oldest (auto-bootstrap candidate)
        // For now, allow access to sites with no team.json (backward compat)
        accessibleSiteIds.push(site.id);
      }
    }
  }

  return NextResponse.json({ siteIds: accessibleSiteIds });
}
