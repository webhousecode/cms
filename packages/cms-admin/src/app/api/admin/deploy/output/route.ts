/**
 * Deploy output browser — directory listing + stats.
 *
 * GET /api/admin/deploy/output?path=<rel>&site=<id>
 *   - returns { entries: [...], stats: {...} } when path is a directory
 *   - 404 when the path doesn't exist
 *
 * Site context comes from the active-site cookie unless a `?site=` is
 * given (admin-tab use). Path defaults to deploy root when omitted.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { listDir, getStats, resolveDeployRoot } from "@/lib/deploy/output-browser";
import { existsSync } from "node:fs";
import path from "node:path";
import { getActiveSiteEntry, getActiveSitePaths } from "@/lib/site-paths";

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

/**
 * Detect what kind of site this is so the UI can show a sensible
 * empty-state when `deploy/` is missing. Four hints:
 *   - "icd-only"      → revalidateUrl set, no local build.ts. Site
 *                       lives in its own repo + builds outside the CMS.
 *                       Content edits flow via the revalidate webhook.
 *                       deploy/ will never exist for this site.
 *   - "static"        → build.ts present in projectDir. CMS produces
 *                       deploy/ when the rocket fires.
 *   - "ssr-ephemeral" → deployProvider explicitly set to fly-ephemeral.
 *                       CMS-orchestrated builds happen in a Fly Machine
 *                       and ship a Docker image; no deploy/ here either.
 *   - "unknown"       → none of the above (rare — usually a half-set-up site)
 */
async function detectSiteHint(): Promise<"icd-only" | "static" | "ssr-ephemeral" | "unknown"> {
  let hasBuildTs = false;
  try {
    const { projectDir } = await getActiveSitePaths();
    hasBuildTs = existsSync(path.join(projectDir, "build.ts"));
  } catch { /* projectDir not resolvable */ }

  let deployProvider = "";
  try {
    const { readSiteConfig } = await import("@/lib/site-config");
    const cfg = await readSiteConfig();
    deployProvider = cfg.deployProvider ?? "";
  } catch { /* config not readable */ }

  if (deployProvider === "fly-ephemeral") return "ssr-ephemeral";
  if (hasBuildTs) return "static";

  let hasRevalidateUrl = false;
  try {
    const site = await getActiveSiteEntry();
    hasRevalidateUrl = !!site?.revalidateUrl;
  } catch { /* no active site */ }
  if (hasRevalidateUrl) return "icd-only";

  return "unknown";
}

export async function GET(req: NextRequest): Promise<Response> {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rel = req.nextUrl.searchParams.get("path") ?? "";
  const overrideSite = req.nextUrl.searchParams.get("site");

  const run = async () => {
    try {
      const root = await resolveDeployRoot();
      const exists = existsSync(root);
      if (!exists) {
        const siteHint = await detectSiteHint();
        return NextResponse.json({
          entries: [],
          stats: { totalFiles: 0, totalBytes: 0, htmlPages: 0 },
          deployRootExists: false,
          path: rel,
          siteHint,
        });
      }
      const [entries, stats] = await Promise.all([listDir(rel), getStats()]);
      return NextResponse.json({ entries, stats, deployRootExists: true, path: rel, siteHint: "static" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Path-escape attempts surface as 400, not 500
      const status = msg.includes("escapes deploy root") ? 400 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  };

  if (overrideSite) {
    const ctx = await resolveOrgForSite(overrideSite);
    if (!ctx) return NextResponse.json({ error: `site not found: ${overrideSite}` }, { status: 404 });
    return withSiteContext(ctx, run);
  }
  return run();
}
