/**
 * F144 P4 — Manual builder trigger.
 *
 * POST /api/builder/trigger?site=<siteId>
 *
 * Body (optional, JSON):
 *   { sha?: string, framework?: "nextjs"|"bun-hono"|"custom"|"static",
 *     runtimePort?: number, registryToken?: string }
 *
 * Auth: requires `deploy.trigger` permission for the target site (session)
 * OR a token with `deploy:trigger` scope.
 *
 * Returns:
 *   { buildId, machineId, siteId, sha, framework, callbackUrl }
 *
 * The actual build runs async on the Fly Machine — caller polls
 * /api/builder/status?site=…&sha=… for live updates.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getActiveSitePaths } from "@/lib/site-paths";
import { issueCallbackToken } from "@/lib/build-orchestrator/callback-token";
import {
  buildSsrSite,
  detectProjectFramework,
} from "@/lib/build-orchestrator/orchestrator";
import { recordBuildEvent } from "@/lib/build-orchestrator/build-log";
import { requireToken, isTokenAuth } from "@/lib/require-token";
import { denyViewers } from "@/lib/require-role";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { readSiteConfig } from "@/lib/site-config";
import type { Resource } from "@/lib/access-tokens";

interface TriggerBody {
  sha?: string;
  framework?: "nextjs" | "bun-hono" | "custom" | "static";
  runtimePort?: number;
  registryToken?: string;
}

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const siteId = req.nextUrl.searchParams.get("site");
  const resource: Resource = siteId ? `site:${siteId}` : "site:*";

  const auth = await requireToken(req, "deploy:trigger", resource);
  if (auth instanceof NextResponse) return auth;

  if (!isTokenAuth(auth)) {
    const denied = await denyViewers();
    if (denied) return denied;
  } else if (!siteId) {
    return NextResponse.json(
      { error: "Token-based trigger requires ?site=<siteId>" },
      { status: 400 },
    );
  }

  const body: TriggerBody = await req.json().catch(() => ({}));
  const sha = body.sha ?? `manual-${Date.now().toString(36)}`;

  const targetSiteId = siteId ?? null;
  const ctx = targetSiteId ? await resolveOrgForSite(targetSiteId) : null;

  const run = async (): Promise<Response> => {
    const sitePaths = await getActiveSitePaths();
    const config = await readSiteConfig();
    const framework = body.framework ?? detectProjectFramework(sitePaths.projectDir);

    if (framework === "static") {
      return NextResponse.json(
        { error: "Static sites use the F143 in-process build path. F144 builders are SSR-only." },
        { status: 400 },
      );
    }

    const targetApp = config.deployAppName;
    if (!targetApp) {
      return NextResponse.json(
        { error: "deployAppName must be configured before triggering a build." },
        { status: 400 },
      );
    }

    const registryToken = body.registryToken ?? process.env.GHCR_PUSH_TOKEN ?? "";
    if (!registryToken) {
      return NextResponse.json(
        { error: "GHCR push token required (body.registryToken or GHCR_PUSH_TOKEN env)." },
        { status: 400 },
      );
    }

    const effectiveSiteId = targetSiteId ?? "active";
    const callbackToken = issueCallbackToken({ siteId: effectiveSiteId, sha });
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const callbackUrl = `${baseUrl}/api/builder/callback`;

    // Pre-write the build record so the UI has something to poll even
    // before the VM posts its first callback.
    await recordBuildEvent({
      siteId: effectiveSiteId,
      sha,
      phase: "init",
      message: `orchestrator triggered build (framework=${framework})`,
    });

    // Kick off async — don't await the full build (could be 5+ min).
    void buildSsrSite({
      siteId: effectiveSiteId,
      sha,
      projectDir: sitePaths.projectDir,
      contentDir: sitePaths.contentDir,
      targetApp,
      framework,
      ...(body.runtimePort !== undefined && { runtimePort: body.runtimePort }),
      registryToken,
      callbackUrl,
      callbackToken,
    }).catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      await recordBuildEvent({
        siteId: effectiveSiteId,
        sha,
        phase: "failed",
        message: `orchestrator error: ${msg}`,
        final: { success: false },
      }).catch(() => { /* swallow — best-effort */ });
    });

    return NextResponse.json({
      ok: true,
      buildId: `${effectiveSiteId}-${sha}`,
      siteId: effectiveSiteId,
      sha,
      framework,
      callbackUrl,
      pollUrl: `/api/builder/status?site=${encodeURIComponent(effectiveSiteId)}&sha=${encodeURIComponent(sha)}`,
    });
  };

  if (ctx) return withSiteContext(ctx, run);
  return run();
}
