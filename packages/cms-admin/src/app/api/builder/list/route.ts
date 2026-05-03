/**
 * F144 P5 — List recent builds for the active site.
 *
 * GET /api/builder/list?site=<siteId>&limit=<N>
 *
 * Walks `_data/builds/<siteId>/*.json`, parses each, and returns a
 * sorted summary (most-recent first). Used by the BuildHistory panel
 * in Site Settings → Deploy.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

import { getActiveSitePaths } from "@/lib/site-paths";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { requireToken, isTokenAuth } from "@/lib/require-token";
import { denyViewers } from "@/lib/require-role";
import type { Resource } from "@/lib/access-tokens";
import type { BuildRecord } from "@/lib/build-orchestrator/build-log";

interface BuildSummary {
  sha: string;
  startedAt: string;
  updatedAt: string;
  phase: BuildRecord["phase"];
  message?: string;
  success?: boolean;
  durationMs?: number;
  imageTag?: string;
}

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const siteId = req.nextUrl.searchParams.get("site");
  if (!siteId) {
    return NextResponse.json({ error: "site query param required" }, { status: 400 });
  }
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 100);
  const resource: Resource = `site:${siteId}`;

  const auth = await requireToken(req, "deploy:read", resource);
  if (auth instanceof NextResponse) return auth;
  if (!isTokenAuth(auth)) {
    const denied = await denyViewers();
    if (denied) return denied;
  }

  const ctx = await resolveOrgForSite(siteId);
  if (!ctx) {
    return NextResponse.json({ error: `site not found: ${siteId}` }, { status: 404 });
  }

  const builds = await withSiteContext(ctx, async () => {
    const { dataDir } = await getActiveSitePaths();
    const dir = path.join(dataDir, "builds", siteId);
    if (!existsSync(dir)) return [] as BuildSummary[];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const summaries: BuildSummary[] = [];
    for (const f of files) {
      const abs = path.join(dir, f);
      try {
        const raw = readFileSync(abs, "utf-8");
        const rec = JSON.parse(raw) as BuildRecord;
        summaries.push({
          sha: rec.sha,
          startedAt: rec.startedAt,
          updatedAt: rec.updatedAt,
          phase: rec.phase,
          ...(rec.message && { message: rec.message }),
          ...(rec.final?.success !== undefined && { success: rec.final.success }),
          ...(rec.final?.durationMs !== undefined && { durationMs: rec.final.durationMs }),
          ...(rec.final?.imageTag && { imageTag: rec.final.imageTag }),
        });
      } catch {
        // Skip malformed file but keep stat-based fallback so it shows up
        try {
          const stat = statSync(abs);
          summaries.push({
            sha: f.replace(/\.json$/, ""),
            startedAt: stat.birthtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
            phase: "failed",
            message: "(corrupt build record)",
          });
        } catch { /* drop */ }
      }
    }
    summaries.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return summaries.slice(0, limit);
  });

  return NextResponse.json({ builds });
}
