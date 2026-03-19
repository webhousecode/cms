import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths, getActiveSiteEntry } from "@/lib/site-paths";
import { readSiteConfig } from "@/lib/site-config";

/** GET /api/admin/deploy/can-deploy — check if the active site can deploy */
export async function GET() {
  try {
    const config = await readSiteConfig();

    // Explicit provider configured
    if (config.deployProvider && config.deployProvider !== "off") {
      return NextResponse.json({ canDeploy: true, provider: config.deployProvider });
    }

    const siteEntry = await getActiveSiteEntry();
    if (!siteEntry) {
      return NextResponse.json({ canDeploy: false });
    }

    // GitHub-backed site → can always deploy to GitHub Pages
    if (siteEntry.adapter === "github") {
      return NextResponse.json({ canDeploy: true, provider: "github-pages" });
    }

    // Filesystem site with build.ts → can deploy to GitHub Pages
    if (siteEntry.adapter === "filesystem") {
      const sitePaths = await getActiveSitePaths();
      const buildFile = path.join(sitePaths.projectDir, "build.ts");
      if (existsSync(buildFile)) {
        return NextResponse.json({ canDeploy: true, provider: "github-pages" });
      }
    }

    return NextResponse.json({ canDeploy: false });
  } catch {
    return NextResponse.json({ canDeploy: false });
  }
}
