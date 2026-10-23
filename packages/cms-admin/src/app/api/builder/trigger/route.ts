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
import { loadRegistry, findSiteOrgId } from "@/lib/site-registry";
import { readSiteConfig } from "@/lib/site-config";
import type { Resource } from "@/lib/access-tokens";
import { getServerTSafe } from "@/i18n/server";

interface TriggerBody {
  sha?: string;
  framework?: "nextjs" | "bun-hono" | "custom" | "static";
  runtimePort?: number;
  registryToken?: string;
}

async function resolveOrgForSite(siteId: string): Promise<{ orgId: string; siteId: string } | null> {
  const registry = await loadRegistry();
  if (!registry) return null;
  const orgId = findSiteOrgId(registry, siteId); // F208: ambiguous → null
  if (orgId) return { orgId, siteId };
  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const t = await getServerTSafe();
  const siteId = req.nextUrl.searchParams.get("site");
  const resource: Resource = siteId ? `site:${siteId}` : "site:*"; // i18n-ignore: permission resource identifier

  const auth = await requireToken(req, "deploy:trigger", resource);
  if (auth instanceof NextResponse) return auth;

  if (!isTokenAuth(auth)) {
    const denied = await denyViewers();
    if (denied) return denied;
  } else if (!siteId) {
    return NextResponse.json(
      { error: t("errApi.builder.tokenNeedsSite") },
      { status: 400 },
    );
  }

  const body: TriggerBody = await req.json().catch(() => ({}));
  const sha = body.sha ?? `manual-${Date.now().toString(36)}`; // i18n-ignore: build sha identifier

  const targetSiteId = siteId ?? null;
  const ctx = targetSiteId ? await resolveOrgForSite(targetSiteId) : null;

  const run = async (): Promise<Response> => {
    const sitePaths = await getActiveSitePaths();
    const config = await readSiteConfig();
    const framework = body.framework ?? detectProjectFramework(sitePaths.projectDir);

    if (framework === "static") {
      return NextResponse.json(
        { error: t("errApi.builder.staticSite") },
        { status: 400 },
      );
    }

    const targetApp = config.deployAppName;
    if (!targetApp) {
      return NextResponse.json(
        { error: t("errApi.builder.needsDeployApp") },
        { status: 400 },
      );
    }

    const registryToken = body.registryToken ?? process.env.GHCR_PUSH_TOKEN ?? "";
    if (!registryToken) {
      return NextResponse.json(
        { error: t("errApi.builder.needsGhcrToken") },
        { status: 400 },
      );
    }

    const effectiveSiteId = targetSiteId ?? "active";
    const callbackToken = issueCallbackToken({ siteId: effectiveSiteId, sha });
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const callbackUrl = `${baseUrl}/api/builder/callback`; // i18n-ignore: callback URL

    // Pre-write the build record so the UI has something to poll even
    // before the VM posts its first callback.
    await recordBuildEvent({
      siteId: effectiveSiteId,
      sha,
      phase: "init",
      message: `orchestrator triggered build (framework=${framework})`, // i18n-ignore: persisted build-log event, shared record written in English like the builder VM's own events
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
        message: `orchestrator error: ${msg}`, // i18n-ignore: persisted build-log event, shared record written in English like the builder VM's own events
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
