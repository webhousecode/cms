/**
 * GET /api/admin/deploy/pages-build-status
 *
 * Polls the latest GitHub Pages build for the active site's repo so the
 * UI can show "Building..." → "Live at <url>" after a publish.
 *
 * GitHub Pages publishes via raw API uploads do NOT go through Actions —
 * they trigger a separate "page_build" lifecycle. Status comes from
 * `/repos/{owner}/{repo}/pages/builds/latest` which returns:
 *   { status: "queued" | "building" | "built" | "errored", duration, …}
 *
 * Returns { found: false } when no token, no repo, or the latest build
 * predates pollSince (caller passes ?since=<unixSec> so older builds
 * don't count as "the deploy I just triggered").
 */
import { NextRequest, NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { resolveToken } from "@/lib/site-pool";

export interface PagesBuildStatus {
  found: boolean;
  status?: "queued" | "building" | "built" | "errored";
  duration?: number;
  url?: string;
  error?: string | null;
  createdAt?: string;
  /** True if the latest build started after the caller's `since` timestamp. */
  isCurrent?: boolean;
}

export async function GET(req: NextRequest): Promise<Response> {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ found: false }, { status: 401 });

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? parseInt(sinceParam, 10) : 0;

  const config = await readSiteConfig();
  let token = config.deployApiToken as string | undefined;
  const repo = config.deployAppName as string | undefined;

  if (token === "oauth") {
    try { token = await resolveToken("oauth"); } catch { token = undefined; }
  }
  if (!token || !repo) return NextResponse.json({ found: false });

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/pages/builds/latest`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return NextResponse.json({ found: false });

    const data = await res.json() as {
      status?: string;
      duration?: number;
      url?: string;
      error?: { message?: string | null };
      created_at?: string;
      commit?: string;
    };

    const createdAtMs = data.created_at ? new Date(data.created_at).getTime() : 0;
    const isCurrent = since === 0 || createdAtMs >= since * 1000;

    const result: PagesBuildStatus = {
      found: true,
      status: data.status as PagesBuildStatus["status"],
      ...(data.duration !== undefined && { duration: data.duration }),
      ...(data.url && { url: data.url }),
      error: data.error?.message ?? null,
      ...(data.created_at && { createdAt: data.created_at }),
      isCurrent,
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ found: false });
  }
}
