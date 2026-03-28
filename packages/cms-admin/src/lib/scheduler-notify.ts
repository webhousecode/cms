/**
 * Send webhook notifications when the scheduler publishes/unpublishes content.
 * Uses the shared webhook dispatcher for Discord/Slack/generic formatting.
 *
 * Reads from publishWebhooks array in SiteConfig.
 * Falls back to legacy schedulerWebhookUrl for backwards compatibility.
 */
import { readSiteConfig, type SiteConfig } from "./site-config";
import { dispatchWebhooks, type WebhookEntry } from "./webhook-dispatch";

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
 * Send webhook notifications for scheduled publish/unpublish events.
 * Accepts optional siteConfig to avoid reading from default site when called from multi-site scheduler.
 */
export async function notifySchedulerEvents(events: SchedulerEvent[], siteConfig?: SiteConfig, dataDir?: string): Promise<void> {
  if (events.length === 0) return;

  try {
    const config = siteConfig ?? await readSiteConfig();

    // Build webhook list: prefer publishWebhooks array, fall back to legacy single URL
    let webhooks: WebhookEntry[] = config.publishWebhooks ?? [];
    if (webhooks.length === 0 && config.schedulerNotifications && config.schedulerWebhookUrl) {
      webhooks = [{ id: "legacy", url: config.schedulerWebhookUrl }];
    }
    if (webhooks.length === 0) return;

    const first = events[0];
    const orgName = first?.orgName ?? first?.orgId ?? "—";
    const siteName = first?.siteName ?? first?.siteId ?? "—";
    const instanceUrl = first?.instanceUrl;

    // Dispatch one webhook event per scheduler action
    for (const evt of events) {
      const title = evt.title && evt.title !== evt.slug ? evt.title : evt.slug;
      const isPublish = evt.action === "published";

      await dispatchWebhooks(webhooks, {
        event: isPublish ? "content.published" : "content.unpublished",
        title: isPublish ? `Published: ${title}` : `Unpublished: ${title}`,
        message: `**${title}** in \`${evt.collection}\``,
        color: isPublish ? 0x4ade80 : 0xef4444,
        fields: [
          { name: "Collection", value: evt.collection },
          { name: "Slug", value: evt.slug },
        ],
        orgName,
        siteName,
        instanceUrl,
      }, dataDir);
    }
  } catch (err) {
    console.error("[scheduler-notify] webhook error:", err);
  }
}
