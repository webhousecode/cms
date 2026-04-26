import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths, getActiveSiteEntry } from "@/lib/site-paths";
import { readSiteConfig } from "@/lib/site-config";
import { resolveToken } from "@/lib/site-pool";
import { getSiteRole } from "@/lib/require-role";

/**
 * GET /api/admin/deploy/can-deploy
 *
 * Auto-detect what the active site CAN do for deploy. Replaces the previous
 * naive "if explicit provider is set, just trust it" — that returned canDeploy
 * for sites where the actual rebuild would always fail (e.g. a Beam-imported
 * Next.js SSR site whose Dockerfile lives in a separate repo). The Deploy
 * button then surfaced an opaque error toast on every click.
 *
 * Now we always probe the project directory and report distinct capabilities
 * so the UI can pick the right affordance:
 *
 *   canRebuildCode   — site has build.ts / Dockerfile / build.command (or is
 *                      a GitHub-adapter site that can deploy via GH Actions).
 *                      Only when this is true does "Deploy now" make sense.
 *   canPublishContent — site has a revalidateUrl wired up, so content edits
 *                       are pushed live via ICD without a rebuild. True even
 *                       when canRebuildCode is false (the SSR-external case).
 *   siteType         — labels the situation so the UI can show a helpful
 *                      explanation instead of a generic error.
 *   reason           — human-readable note on why canRebuildCode is false,
 *                      shown as tooltip on the disabled/hidden Deploy button.
 *
 * canDeploy is kept as a derived `canRebuildCode` for backwards compatibility
 * with callers that haven't migrated yet.
 */
type SiteType = "static-with-build" | "ssr-with-dockerfile" | "ssr-external" | "github-adapter" | "unknown";

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ canDeploy: false }, { status: 401 });
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

    const canPublishContent = !!(
      // Site registry has a revalidate webhook (ICD pushes content live without rebuild)
      (await getActiveSiteEntry().catch(() => null))?.revalidateUrl
    );

    const siteEntry = await getActiveSiteEntry().catch(() => null);

    // Probe project dir for build pipeline artefacts. Decisive for canRebuildCode.
    const sitePaths = await getActiveSitePaths().catch(() => null);
    const hasBuildTs = !!sitePaths && existsSync(path.join(sitePaths.projectDir, "build.ts"));
    const hasDockerfile = !!sitePaths && existsSync(path.join(sitePaths.projectDir, "Dockerfile"));
    const hasBuildCommand = !!(config as { build?: { command?: string } }).build?.command;
    const isGitHubAdapter = siteEntry?.adapter === "github";

    let siteType: SiteType = "unknown";
    if (hasBuildTs) siteType = "static-with-build";
    else if (hasDockerfile || hasBuildCommand) siteType = "ssr-with-dockerfile";
    else if (isGitHubAdapter) siteType = "github-adapter";
    else if (canPublishContent) siteType = "ssr-external";

    // canRebuildCode = the "Deploy now" button can do useful work
    const canRebuildCode = hasBuildTs || hasDockerfile || hasBuildCommand || isGitHubAdapter;

    let reason: string | undefined;
    if (!canRebuildCode) {
      if (canPublishContent) {
        reason = "Code lives in a separate repo. Content edits go live automatically via Instant Content Deployment (ICD); code rebuilds happen via git push to that repo.";
      } else {
        reason = "No build.ts, Dockerfile, build.command, GitHub adapter, or revalidate webhook configured.";
      }
    }

    // Resolve the effective provider for legacy callers (string union for the
    // body — header/UI just needs to know whether it's "off" or something).
    let provider: string = config.deployProvider && config.deployProvider !== "off" ? config.deployProvider : "off";
    if (provider === "off") {
      if (hasBuildTs) provider = "github-pages";
      else if (hasDockerfile) provider = "flyio";
      else if (isGitHubAdapter) provider = "github-pages";
    }

    return NextResponse.json({
      // New, descriptive fields
      siteType,
      canRebuildCode,
      canPublishContent,
      reason,
      // Back-compat
      canDeploy: canRebuildCode,
      provider,
      hasGitHubToken,
      ...(isGitHubAdapter && siteEntry.github
        ? { githubOwner: siteEntry.github.owner, githubRepo: siteEntry.github.repo }
        : {}),
    });
  } catch {
    return NextResponse.json({ canDeploy: false, canRebuildCode: false, canPublishContent: false, hasGitHubToken: false });
  }
}
