/**
 * Send webhook notification when scheduler executes a task.
 * Works with Discord, Slack, and any webhook endpoint that accepts JSON POST.
 *
 * Discord format: { content: "...", embeds: [...] }
 * Slack format: { text: "..." }
 * Generic: { event, collection, slug, action, timestamp }
 *
 * We detect Discord/Slack URLs and format accordingly, otherwise send generic JSON.
 */
import { readSiteConfig, type SiteConfig } from "./site-config";

interface SchedulerEvent {
  action: "published" | "unpublished";
  collection: string;
  slug: string;
}

/**
 * Send webhook notifications. Accepts optional siteConfig to avoid
 * reading from default site when called from multi-site scheduler.
 */
export async function notifySchedulerEvents(events: SchedulerEvent[], siteConfig?: SiteConfig): Promise<void> {
  if (events.length === 0) return;

  try {
    const config = siteConfig ?? await readSiteConfig();
    if (!config.schedulerNotifications || !config.schedulerWebhookUrl) return;

    const url = config.schedulerWebhookUrl;
    const isDiscord = url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks");
    const isSlack = url.includes("hooks.slack.com");

    const body = isDiscord
      ? formatDiscord(events)
      : isSlack
        ? formatSlack(events)
        : formatGeneric(events);

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[scheduler-notify] webhook error:", err);
  }
}

function formatDiscord(events: SchedulerEvent[]) {
  const embeds = events.map((e) => ({
    title: e.action === "published"
      ? `Published: ${e.slug}`
      : `Unpublished: ${e.slug}`,
    description: `Collection: **${e.collection}**`,
    color: e.action === "published" ? 0x4ade80 : 0xef4444, // green / red
    timestamp: new Date().toISOString(),
    footer: { text: "CMS Scheduler" },
  }));

  return {
    content: `Scheduler executed ${events.length} task${events.length > 1 ? "s" : ""}`,
    embeds: embeds.slice(0, 10), // Discord max 10 embeds
  };
}

function formatSlack(events: SchedulerEvent[]) {
  const lines = events.map((e) =>
    e.action === "published"
      ? `:white_check_mark: *Published* \`${e.collection}/${e.slug}\``
      : `:red_circle: *Unpublished* \`${e.collection}/${e.slug}\``
  );
  return {
    text: `*CMS Scheduler* — ${events.length} task${events.length > 1 ? "s" : ""} executed\n${lines.join("\n")}`,
  };
}

function formatGeneric(events: SchedulerEvent[]) {
  return {
    event: "scheduler.executed",
    timestamp: new Date().toISOString(),
    tasks: events.map((e) => ({
      action: e.action,
      collection: e.collection,
      slug: e.slug,
    })),
  };
}
