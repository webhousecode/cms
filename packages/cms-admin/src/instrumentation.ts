/**
 * Next.js instrumentation hook — runs once on server startup.
 * 1. Auto-publishes scheduled documents every minute.
 * 2. Runs due AI agents based on their schedules every 5 minutes.
 * 3. Updates calendar snapshot every 5 minutes.
 * 4. Runs link checker on a configurable schedule (LINK_CHECK_SCHEDULE=daily|weekly).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── 1. Scheduled document publishing (every 60s) ──────────────
  async function publishTick() {
    try {
      const { getAdminCms, getAdminConfig, getAdminCmsForSite, getAdminConfigForSite } = await import("./lib/cms");
      const { loadRegistry } = await import("./lib/site-registry");
      const registry = await loadRegistry();

      // Collect all site instances to check (default + all registered)
      const sites: { cms: any; config: any; label: string }[] = [];

      if (!registry) {
        // Single-site mode
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        sites.push({ cms, config, label: "default" });
      } else {
        for (const org of registry.orgs) {
          for (const site of org.sites) {
            try {
              const [cms, config] = await Promise.all([
                getAdminCmsForSite(org.id, site.id),
                getAdminConfigForSite(org.id, site.id),
              ]);
              if (cms && config) sites.push({ cms, config, label: `${org.id}/${site.id}` });
            } catch { /* skip sites that fail to init (e.g. missing GitHub token) */ }
          }
        }
      }

      for (const { cms, config, label } of sites) {
        const collections = config.collections.map((c: any) => c.name);
        const actions = await cms.content.publishDue(collections);
        if (actions.length > 0) {
          const pub = actions.filter((a: any) => a.action === "published");
          const unpub = actions.filter((a: any) => a.action === "unpublished");
          if (pub.length > 0) console.log(`[cron:${label}] auto-published ${pub.length} document(s):`, pub.map((p: any) => `${p.collection}/${p.slug}`).join(", "));
          if (unpub.length > 0) console.log(`[cron:${label}] auto-unpublished ${unpub.length} document(s):`, unpub.map((p: any) => `${p.collection}/${p.slug}`).join(", "));

          // Send webhook notifications
          const { notifySchedulerEvents } = await import("./lib/scheduler-notify");
          notifySchedulerEvents(actions).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[cron] publishDue error:", err);
    }
  }

  setTimeout(publishTick, 10_000);
  setInterval(publishTick, 60_000);

  // ── 2. AI agent scheduler (every 5 minutes) ───────────────────
  async function agentTick() {
    try {
      const { runScheduledAgents } = await import("./lib/scheduler");
      const result = await runScheduledAgents();
      if (result.ran.length > 0) {
        console.log(`[scheduler] Ran agents: ${result.ran.join(", ")}`);
      }
      if (result.errors.length > 0) {
        console.error(`[scheduler] Errors: ${result.errors.join("; ")}`);
      }
    } catch (err) {
      console.error("[scheduler] fatal:", err);
    }
  }

  // First agent check 2 minutes after startup, then every 5 minutes
  setTimeout(agentTick, 2 * 60_000);
  setInterval(agentTick, 5 * 60_000);

  // ── 3. Calendar snapshot (every 5 minutes) ──────────────────
  async function snapshotTick() {
    try {
      const { updateScheduledSnapshot } = await import("./lib/scheduled-snapshot");
      await updateScheduledSnapshot();
    } catch (err) {
      console.error("[snapshot] error:", err);
    }
  }

  setTimeout(snapshotTick, 15_000); // First snapshot 15s after startup
  setInterval(snapshotTick, 5 * 60_000);

  // ── 4. Link checker (daily or weekly, opt-in via env) ─────────
  const linkCheckSchedule = process.env.LINK_CHECK_SCHEDULE; // "daily" | "weekly"
  if (linkCheckSchedule === "daily" || linkCheckSchedule === "weekly") {
    async function linkCheckTick() {
      try {
        const { readLinkCheckResult, writeLinkCheckResult } = await import("./lib/link-check-store");

        // Throttle: skip if already checked within the required interval
        const last = await readLinkCheckResult();
        const intervalMs = linkCheckSchedule === "weekly" ? 7 * 86_400_000 : 86_400_000;
        if (last && Date.now() - new Date(last.checkedAt).getTime() < intervalMs) return;

        console.log(`[link-checker] Running scheduled check (${linkCheckSchedule})…`);
        const { runLinkCheck } = await import("./lib/link-check-runner");
        const result = await runLinkCheck();
        await writeLinkCheckResult(result);
        console.log(`[link-checker] ✓ ${result.total} links checked, ${result.broken} broken`);
      } catch (err) {
        console.error("[link-checker] scheduler error:", err);
      }
    }

    // First check 5 minutes after startup, then every hour (actual run is throttled by interval)
    setTimeout(linkCheckTick, 5 * 60_000);
    setInterval(linkCheckTick, 60 * 60_000);
  }
}
