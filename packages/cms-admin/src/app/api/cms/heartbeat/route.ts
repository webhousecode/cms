import { NextResponse } from "next/server";

/**
 * GET /api/cms/heartbeat
 *
 * Runs all pending scheduled tasks immediately:
 * 1. Publish/unpublish documents past their scheduled date
 * 2. Run due AI agents
 * 3. Run tools scheduler (backup, link check)
 * 4. Update calendar snapshot
 *
 * Designed to be called by an external cron (macOS crontab, GitHub Actions,
 * Fly.io cron machine) to keep scheduled tasks running even when the CMS
 * admin has no interactive traffic. See F60 Reliable Scheduled Tasks.
 *
 * Auth: requires X-CMS-Service-Token header (= CMS_JWT_SECRET).
 * Middleware already validates this, so the route itself trusts the caller.
 */
export async function GET() {
  const started = Date.now();
  const ran: string[] = [];
  const errors: string[] = [];

  // 1. Publish/unpublish scheduled documents
  try {
    const { getAdminCms, getAdminConfig } = await import("@/lib/cms");
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const collections = config.collections.map((c) => c.name);
    const actions = await cms.content.publishDue(collections);
    if (actions.length > 0) {
      ran.push(`published: ${actions.length} doc(s)`);
    }
  } catch (err) {
    errors.push(`publish: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Run due AI agents
  try {
    const { runScheduledAgents } = await import("@/lib/scheduler");
    const result = await runScheduledAgents();
    if (result.ran.length > 0) {
      ran.push(`agents: ${result.ran.join(", ")}`);
    }
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((e) => `agent: ${e}`));
    }
  } catch (err) {
    errors.push(`agents: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Run tools scheduler (backup, link check)
  try {
    const { runToolsScheduler } = await import("@/lib/tools-scheduler");
    const result = await runToolsScheduler();
    if (result.backupRan) ran.push("backup: completed");
    if (result.linkCheckRan) ran.push("link-check: completed");
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((e) => `tools: ${e}`));
    }
  } catch (err) {
    errors.push(`tools: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Update calendar snapshot
  try {
    const { updateScheduledSnapshot } = await import("@/lib/scheduled-snapshot");
    await updateScheduledSnapshot();
    ran.push("snapshot: updated");
  } catch (err) {
    errors.push(`snapshot: ${err instanceof Error ? err.message : String(err)}`);
  }

  const durationMs = Date.now() - started;
  console.log(`[heartbeat] ${ran.length} tasks ran in ${durationMs}ms${errors.length ? ` (${errors.length} errors)` : ""}`);

  return NextResponse.json({
    ok: true,
    durationMs,
    ran,
    errors,
    timestamp: new Date().toISOString(),
  });
}
