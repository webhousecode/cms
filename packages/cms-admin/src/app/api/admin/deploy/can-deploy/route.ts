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

    // Check if site has a build.ts (static site) or Dockerfile (Next.js/SSR)
    const sitePaths = await getActiveSitePaths();
    const buildFile = path.join(sitePaths.projectDir, "build.ts");
    const dockerFile = path.join(sitePaths.projectDir, "Dockerfile");
    const hasBuildTs = existsSync(buildFile);
    const hasDockerfile = existsSync(dockerFile);

    if (hasBuildTs) {
      // Static site with build.ts → can auto-deploy to GitHub Pages
      return NextResponse.json({ canDeploy: true, provider: "github-pages", hasGitHubToken });
    }

    if (hasDockerfile) {
      // Next.js/SSR site with Dockerfile → can deploy to Fly.io
      return NextResponse.json({ canDeploy: true, provider: "flyio", hasGitHubToken });
    }

    // No build.ts or Dockerfile → needs explicit deploy config
    return NextResponse.json({ canDeploy: false, hasGitHubToken });
  } catch {
    return NextResponse.json({ canDeploy: false, hasGitHubToken: false });
  }
}
