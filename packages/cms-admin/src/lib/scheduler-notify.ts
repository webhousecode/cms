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
  title?: string;
  orgId?: string;
  orgName?: string;
  siteId?: string;
  siteName?: string;
  instanceUrl?: string;
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
  const first = events[0];
  const instance = first?.instanceUrl ?? "unknown";
  const org = first?.orgName ?? first?.orgId ?? "—";
  const site = first?.siteName ?? first?.siteId ?? "—";

  const embeds = events.map((e) => {
    const title = e.title && e.title !== e.slug ? e.title : e.slug;
    const lines = [
      `Document: **${title}**`,
      `Collection: **${e.collection}**`,
      `Slug: \`${e.slug}\``,
      `Org: **${e.orgName ?? e.orgId ?? "—"}** · Site: **${e.siteName ?? e.siteId ?? "—"}**`,
    ];
    return {
      title: e.action === "published"
        ? `Published: ${title}`
        : `Unpublished: ${title}`,
      description: lines.join("\n"),
      color: e.action === "published" ? 0x4ade80 : 0xef4444,
      timestamp: new Date().toISOString(),
      footer: { text: `CMS Scheduler · ${instance}` },
    };
  });

  return {
    content: `Scheduler executed ${events.length} task${events.length > 1 ? "s" : ""} on **${site}** (${org})`,
    embeds: embeds.slice(0, 10),
  };
}

function formatSlack(events: SchedulerEvent[]) {
  const first = events[0];
  const site = first?.siteName ?? first?.siteId ?? "—";
  const org = first?.orgName ?? first?.orgId ?? "—";
  const lines = events.map((e) => {
    const title = e.title && e.title !== e.slug ? e.title : e.slug;
    return e.action === "published"
      ? `:white_check_mark: *Published* _${title}_ \`${e.collection}/${e.slug}\``
      : `:red_circle: *Unpublished* _${title}_ \`${e.collection}/${e.slug}\``;
  });
  return {
    text: `*CMS Scheduler* — ${events.length} task${events.length > 1 ? "s" : ""} on *${site}* (${org})\n${lines.join("\n")}`,
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
