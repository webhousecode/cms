import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths, getActiveSiteEntry } from "@/lib/site-paths";
import { readSiteConfig } from "@/lib/site-config";
import { resolveToken } from "@/lib/site-pool";

/** GET /api/admin/deploy/can-deploy — check if the active site can deploy */
export async function GET() {
  try {
    const config = await readSiteConfig();

    // Check if a GitHub token is available
    let hasGitHubToken = false;
    if (config.deployApiToken) {
      hasGitHubToken = true;
    } else {
      try {
        await resolveToken("oauth");
        hasGitHubToken = true;
      } catch { /* no token */ }
    }

    // Explicit provider configured
    if (config.deployProvider && config.deployProvider !== "off") {
      return NextResponse.json({ canDeploy: true, provider: config.deployProvider, hasGitHubToken });
    }

    const siteEntry = await getActiveSiteEntry();
    if (!siteEntry) {
      return NextResponse.json({ canDeploy: false, hasGitHubToken });
    }

    // GitHub-backed site → can always deploy to GitHub Pages
    if (siteEntry.adapter === "github") {
      return NextResponse.json({ canDeploy: true, provider: "github-pages", hasGitHubToken });
    }

    // Filesystem site with build.ts → can deploy to GitHub Pages
    if (siteEntry.adapter === "filesystem") {
      const sitePaths = await getActiveSitePaths();
      const buildFile = path.join(sitePaths.projectDir, "build.ts");
      if (existsSync(buildFile)) {
        return NextResponse.json({ canDeploy: true, provider: "github-pages", hasGitHubToken });
      }
    }

    return NextResponse.json({ canDeploy: false, hasGitHubToken });
  } catch {
    return NextResponse.json({ canDeploy: false, hasGitHubToken: false });
  }
}
