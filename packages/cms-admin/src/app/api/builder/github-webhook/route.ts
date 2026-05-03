/**
 * F144 P8 — GitHub push webhook → ephemeral SSR build trigger.
 *
 * POST /api/builder/github-webhook
 * Headers:
 *   X-Hub-Signature-256: sha256=<hex>     (HMAC of raw body w/ shared secret)
 *   X-GitHub-Event: push                  (we only handle push)
 *
 * On a verified push:
 *   1. Parse repository.full_name + ref + after-sha
 *   2. Look up matching site(s) via configPath = github://owner/repo/...
 *   3. For each site whose deploy provider is "fly-ephemeral", fire
 *      buildSsrSite() async, write a build-log entry
 *   4. Skip silently for sites on other providers (the webhook is a
 *      no-op for them, NOT an error)
 *
 * Returns 200 with a list of triggered builds (or empty list) so
 * GitHub's webhook delivery UI shows green checks.
 */
import { NextResponse, type NextRequest } from "next/server";

import { issueCallbackToken } from "@/lib/build-orchestrator/callback-token";
import { recordBuildEvent } from "@/lib/build-orchestrator/build-log";
import { buildSsrSite, detectProjectFramework } from "@/lib/build-orchestrator/orchestrator";
import {
  findSitesByGitHubRepo,
  parsePushEvent,
  verifyGitHubSignature,
} from "@/lib/build-orchestrator/github-webhook";
import { withSiteContext } from "@/lib/site-context";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readSiteConfig } from "@/lib/site-config";

function getWebhookSecret(): string | null {
  return process.env.CMS_GITHUB_WEBHOOK_SECRET || null;
}

interface TriggeredBuild {
  orgId: string;
  siteId: string;
  sha: string;
  branch: string | null;
  status: "triggered" | "skipped" | "error";
  reason?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const event = req.headers.get("x-github-event") ?? "";
  const sigHeader = req.headers.get("x-hub-signature-256");
  const rawBody = await req.text();

  const secret = getWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "CMS_GITHUB_WEBHOOK_SECRET env not configured on cms-admin" },
      { status: 503 },
    );
  }

  const sigCheck = verifyGitHubSignature(rawBody, sigHeader, secret);
  if (!sigCheck.valid) {
    return NextResponse.json({ error: `bad signature: ${sigCheck.reason}` }, { status: 401 });
  }

  // Ping events: GitHub sends one when you save the webhook config —
  // ack 200 so the UI shows green.
  if (event === "ping") return NextResponse.json({ ok: true, event: "ping" });

  if (event !== "push") {
    return NextResponse.json({ ok: true, event, note: "only push events trigger builds" });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }

  const parsed = parsePushEvent(payload);
  if (!parsed) {
    return NextResponse.json({ error: "missing repository.full_name / ref / after" }, { status: 400 });
  }

  // Only build pushes to the repo's default branch (ignore feature
  // branches + tags). This mirrors GitHub Pages' default behavior and
  // avoids spawning a Fly Machine per topic-branch push.
  if (!parsed.branch || (parsed.defaultBranch && parsed.branch !== parsed.defaultBranch)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `branch=${parsed.branch} (default=${parsed.defaultBranch ?? "?"}); only default branch builds`,
    });
  }

  const sites = await findSitesByGitHubRepo(parsed.repoFullName);
  if (sites.length === 0) {
    return NextResponse.json({
      ok: true,
      triggered: [],
      reason: `no site registered for repo ${parsed.repoFullName}`,
    });
  }

  const triggered: TriggeredBuild[] = [];

  for (const match of sites) {
    const ctx = { orgId: match.orgId, siteId: match.siteId };
    const result = await withSiteContext(ctx, async (): Promise<TriggeredBuild> => {
      const config = await readSiteConfig();
      if (config.deployProvider !== "fly-ephemeral") {
        return {
          orgId: match.orgId,
          siteId: match.siteId,
          sha: parsed.sha,
          branch: parsed.branch,
          status: "skipped",
          reason: `deployProvider=${config.deployProvider} (not fly-ephemeral)`,
        };
      }
      const targetApp = config.deployAppName;
      const registryToken = process.env.GHCR_PUSH_TOKEN || "";
      if (!targetApp || !registryToken) {
        return {
          orgId: match.orgId,
          siteId: match.siteId,
          sha: parsed.sha,
          branch: parsed.branch,
          status: "error",
          reason: "missing deployAppName or GHCR_PUSH_TOKEN",
        };
      }

      const callbackToken = issueCallbackToken({ siteId: match.siteId, sha: parsed.sha });
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      const callbackUrl = `${baseUrl}/api/builder/callback`;

      const sitePaths = await getActiveSitePaths();
      const framework = detectProjectFramework(sitePaths.projectDir);

      // Pre-write the init event so the UI can show "build in flight"
      await recordBuildEvent({
        siteId: match.siteId,
        sha: parsed.sha,
        phase: "init",
        message: `gh-webhook push event (branch=${parsed.branch}, framework=${framework})`,
      });

      // Async — webhook returns 200 fast; build runs in the background
      void buildSsrSite({
        siteId: match.siteId,
        sha: parsed.sha,
        projectDir: sitePaths.projectDir,
        contentDir: sitePaths.contentDir,
        targetApp,
        framework,
        registryToken,
        callbackUrl,
        callbackToken,
      }).catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        await recordBuildEvent({
          siteId: match.siteId,
          sha: parsed.sha,
          phase: "failed",
          message: `orchestrator error: ${msg}`,
          final: { success: false },
        }).catch(() => { /* swallow */ });
      });

      return {
        orgId: match.orgId,
        siteId: match.siteId,
        sha: parsed.sha,
        branch: parsed.branch,
        status: "triggered",
      };
    });
    triggered.push(result);
  }

  return NextResponse.json({ ok: true, repo: parsed.repoFullName, triggered });
}
