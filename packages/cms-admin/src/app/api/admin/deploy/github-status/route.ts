/**
 * GET /api/admin/deploy/github-status
 *
 * Polls the latest GitHub Actions workflow run for the active site's repo.
 * Returns the run status so the Deploy button can show live progress.
 *
 * Requires deployApiToken + deployAppName (owner/repo) in site config.
 */
import { NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { resolveToken } from "@/lib/site-pool";

export interface GitHubRunStatus {
  found: boolean;
  runId?: number;
  status?: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "cancelled" | "skipped" | null;
  url?: string;
  startedAt?: string;
}

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ found: false }, { status: 401 });

  const config = await readSiteConfig();
  let token = config.deployApiToken as string | undefined;
  const repo = config.deployAppName as string | undefined; // "owner/repo"

  // "oauth" is a sentinel meaning "use the OAuth cookie token" — must
  // be resolved to the actual access_token before sending to GitHub.
  if (token === "oauth") {
    try { token = await resolveToken("oauth"); } catch { token = undefined; }
  }

  if (!token || !repo) {
    return NextResponse.json({ found: false });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=1`,
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

    const data = await res.json() as { workflow_runs: Array<{
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
    }> };

    const run = data.workflow_runs?.[0];
    if (!run) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      runId: run.id,
      status: run.status as GitHubRunStatus["status"],
      conclusion: run.conclusion as GitHubRunStatus["conclusion"],
      url: run.html_url,
      startedAt: run.created_at,
    } satisfies GitHubRunStatus);
  } catch {
    return NextResponse.json({ found: false });
  }
}
