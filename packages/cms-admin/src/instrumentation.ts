/**
 * Next.js instrumentation hook — runs once on server startup.
 * 1. Auto-publishes scheduled documents every minute.
 * 2. Runs due AI agents based on their schedules every 5 minutes.
 * 3. Runs link checker on a configurable schedule (LINK_CHECK_SCHEDULE=daily|weekly).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── 1. Scheduled document publishing (every 60s) ──────────────
  async function publishTick() {
    try {
      const { getAdminCms, getAdminConfig } = await import("./lib/cms");
      const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
      const collections = config.collections.map((c) => c.name);
      const published = await cms.content.publishDue(collections);
      if (published.length > 0) {
        console.log(
          `[cron] auto-published ${published.length} document(s):`,
          published.map((p) => `${p.collection}/${p.slug}`).join(", "),
        );
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
      const { listAgents } = await import("./lib/agents");
      const { runAgent } = await import("./lib/agent-runner");

      const agents = await listAgents();
      const now = new Date();

      // Simple schedule check: agent.schedule.enabled + frequency/time match
      for (const agent of agents) {
        if (!agent.active || !agent.schedule.enabled) continue;
        if (agent.schedule.frequency === "manual") continue;
        if (agent.schedule.frequency === "weekly" && now.getDay() !== 1) continue;

        const [h, m] = agent.schedule.time.split(":").map(Number);
        const agentMinutes = (h ?? 0) * 60 + (m ?? 0);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const diff = Math.abs(nowMinutes - agentMinutes);

        if (diff > 5 && diff < 1435) continue; // outside 5-minute window

        console.log(`[agents] Running scheduled agent: ${agent.name}`);
        const prompt = `Generate a new ${agent.role === "seo" ? "SEO-optimised" : "engaging"} piece of content for the site. Today is ${now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

        for (let i = 0; i < Math.min(agent.schedule.maxPerRun, 5); i++) {
          try {
            const result = await runAgent(agent.id, prompt);
            console.log(`[agents] ✓ ${agent.name}: "${result.title}" → queue`);
          } catch (err) {
            console.error(`[agents] ✗ ${agent.name} run ${i + 1}:`, err);
            break;
          }
        }
      }
    } catch (err) {
      console.error("[agents] scheduler error:", err);
    }
  }

  // First agent check 2 minutes after startup, then every 5 minutes
  setTimeout(agentTick, 2 * 60_000);
  setInterval(agentTick, 5 * 60_000);

  // ── 3. Link checker (daily or weekly, opt-in via env) ─────────
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
