/**
 * Next.js instrumentation hook — runs once on server startup.
 * Registers a cron that auto-publishes scheduled documents every minute.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const INTERVAL_MS = 60_000;

  async function tick() {
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

  // Run once shortly after startup, then every minute
  setTimeout(tick, 10_000);
  setInterval(tick, INTERVAL_MS);
}
