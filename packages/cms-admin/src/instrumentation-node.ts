/**
 * Node.js-only instrumentation — imported dynamically by instrumentation.ts.
 * Separated to prevent Next.js Edge Runtime compile warnings about fs/path/nanoid.
 *
 * 1. Auto-publishes scheduled documents every minute.
 * 2. Runs due AI agents based on their schedules every 5 minutes.
 * 3. Updates calendar snapshot every 5 minutes.
 * 4. Runs link checker on a configurable schedule (LINK_CHECK_SCHEDULE=daily|weekly).
 */

// ── 1. Scheduled document publishing (every 60s) ──────────────
async function publishTick() {
  try {
    const { getAdminCms, getAdminConfig, getAdminCmsForSite, getAdminConfigForSite } = await import("./lib/cms");
    const { loadRegistry } = await import("./lib/site-registry");
    const registry = await loadRegistry();

    // Collect all site instances to check (default + all registered)
    const sites: { cms: any; config: any; orgId: string; siteId: string }[] = [];

    if (!registry) {
      // Single-site mode
      const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
      sites.push({ cms, config, orgId: "", siteId: "default" });
    } else {
      for (const org of registry.orgs) {
        for (const site of org.sites) {
          try {
            const [cms, config] = await Promise.all([
              getAdminCmsForSite(org.id, site.id),
              getAdminConfigForSite(org.id, site.id),
            ]);
            if (cms && config) sites.push({ cms, config, orgId: org.id, siteId: site.id });
          } catch { /* skip sites that fail to init */ }
        }
      }
    }

    const { notifySchedulerEvents } = await import("./lib/scheduler-notify");
    const { readSiteConfigForSite } = await import("./lib/site-config");
    const { appendSchedulerEvents } = await import("./lib/scheduler-log");
    const { getSiteDataDir } = await import("./lib/site-paths");
    const { emitSchedulerEvents } = await import("./lib/scheduler-bus");

    for (const { cms, config, orgId, siteId } of sites) {
      const collections = config.collections.map((c: any) => c.name);
      const actions = await cms.content.publishDue(collections);
      if (actions.length > 0) {
        const pub = actions.filter((a: any) => a.action === "published");
        const unpub = actions.filter((a: any) => a.action === "unpublished");
        if (pub.length > 0) console.log(`[cron:${orgId}/${siteId}] auto-published ${pub.length}:`, pub.map((p: any) => `${p.collection}/${p.slug}`).join(", "));
        if (unpub.length > 0) console.log(`[cron:${orgId}/${siteId}] auto-unpublished ${unpub.length}:`, unpub.map((p: any) => `${p.collection}/${p.slug}`).join(", "));

        // Push to SSE bus for instant UI updates + write to log file for history
        const now = new Date().toISOString();
        const logEvents = actions.map((a: any, i: number) => ({
          id: `evt-${Date.now()}-${i}`,
          collection: a.collection,
          slug: a.slug,
          action: a.action as "published" | "unpublished",
          title: a.title ?? a.slug,
          timestamp: now,
        }));
        emitSchedulerEvents(logEvents);
        try {
          const dataDir = await getSiteDataDir(orgId, siteId);
          if (dataDir) {
            await appendSchedulerEvents(logEvents, dataDir);
          }
        } catch { /* non-critical */ }

        // Send webhook with site-specific config + enriched context
        const siteConfig = orgId ? await readSiteConfigForSite(orgId, siteId).catch(() => null) : null;
        const org = registry?.orgs.find((o: any) => o.id === orgId);
        const site = org?.sites.find((s: any) => s.id === siteId);
        const port = process.env.PORT ?? "3010";
        const instanceUrl = `localhost:${port}`;
        const enriched = actions.map((a: any) => ({
          ...a,
          title: a.title ?? a.slug,
          orgId, orgName: org?.name, siteId, siteName: site?.name, instanceUrl,
        }));
        notifySchedulerEvents(enriched, siteConfig ?? undefined).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[cron] publishDue error:", err);
  }
}

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

// ── 3. Tools scheduler — backup + link check (every 5 minutes) ──
async function toolsTick() {
  try {
    const { runToolsScheduler } = await import("./lib/tools-scheduler");
    const result = await runToolsScheduler();
    if (result.backupRan) console.log("[tools-scheduler] Backup completed");
    if (result.linkCheckRan) console.log("[tools-scheduler] Link check completed");
    if (result.errors.length > 0) console.error(`[tools-scheduler] Errors: ${result.errors.join("; ")}`);
  } catch (err) {
    console.error("[tools-scheduler] fatal:", err);
  }
}

// ── 4. Calendar snapshot (every 5 minutes) ──────────────────
async function snapshotTick() {
  try {
    const { updateScheduledSnapshot } = await import("./lib/scheduled-snapshot");
    await updateScheduledSnapshot();
  } catch (err) {
    console.error("[snapshot] error:", err);
  }
}

export function startSchedulers() {
  // 1. Publish scheduler — first run 10s after startup, then every 60s
  setTimeout(publishTick, 10_000);
  setInterval(publishTick, 60_000);

  // 2. Agent scheduler — first run 2 min after startup, then every 5 min
  setTimeout(agentTick, 2 * 60_000);
  setInterval(agentTick, 5 * 60_000);

  // 3. Tools scheduler — first run 3 min after startup, then every 5 min
  setTimeout(toolsTick, 3 * 60_000);
  setInterval(toolsTick, 5 * 60_000);

  // 4. Calendar snapshot — first run 15s after startup, then every 5 min
  setTimeout(snapshotTick, 15_000);
  setInterval(snapshotTick, 5 * 60_000);

  // 5. Link checker (daily or weekly, opt-in via env)
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

    // First check 5 minutes after startup, then every hour (throttled by interval)
    setTimeout(linkCheckTick, 5 * 60_000);
    setInterval(linkCheckTick, 60 * 60_000);
  }
}
