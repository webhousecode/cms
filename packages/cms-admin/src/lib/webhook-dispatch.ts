/**
 * Shared webhook dispatcher for all CMS automation events.
 * Detects Discord/Slack URLs and formats accordingly, otherwise sends generic JSON.
 * Dispatches to all webhooks in parallel; one failure doesn't block others.
 *
 * Used by: scheduler-notify (publish), tools-scheduler (backup, link check), agent-runner.
 */

export interface WebhookEntry { id: string; url: string }

export interface WebhookEvent {
  event: string;
  title: string;
  message: string;
  color?: number;
  fields?: { name: string; value: string }[];
  orgName?: string;
  siteName?: string;
  instanceUrl?: string;
}

export interface DispatchResult {
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

function isDiscordUrl(url: string): boolean {
  return url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks");
}

function isSlackUrl(url: string): boolean {
  return url.includes("hooks.slack.com");
}

function formatDiscord(evt: WebhookEvent): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    title: evt.title,
    description: evt.message,
    color: evt.color ?? 0xF7BB2E,
    timestamp: new Date().toISOString(),
    footer: { text: `webhouse.app${evt.instanceUrl ? ` · ${evt.instanceUrl}` : ""}` },
  };
  if (evt.fields?.length) {
    embed.fields = evt.fields.map((f) => ({ name: f.name, value: f.value, inline: true }));
  }
  const site = evt.siteName ?? "—";
  const org = evt.orgName ?? "—";
  return {
    content: `**${evt.event}** on ${site} (${org})`,
    embeds: [embed],
  };
}

function formatSlack(evt: WebhookEvent): Record<string, unknown> {
  const site = evt.siteName ?? "—";
  const org = evt.orgName ?? "—";
  const fieldLines = (evt.fields ?? []).map((f) => `• *${f.name}:* ${f.value}`).join("\n");
  const body = fieldLines ? `${evt.message}\n${fieldLines}` : evt.message;
  return {
    text: `*${evt.title}* — ${site} (${org})\n${body}`,
  };
}

function formatGeneric(evt: WebhookEvent): Record<string, unknown> {
  return {
    event: evt.event,
    title: evt.title,
    message: evt.message,
    timestamp: new Date().toISOString(),
    fields: evt.fields ?? [],
    org: evt.orgName,
    site: evt.siteName,
  };
}

function formatPayload(url: string, evt: WebhookEvent): Record<string, unknown> {
  if (isDiscordUrl(url)) return formatDiscord(evt);
  if (isSlackUrl(url)) return formatSlack(evt);
  return formatGeneric(evt);
}

/**
 * Dispatch a webhook event to all configured webhooks.
 * Returns results for each webhook (success/failure).
 * Optionally logs to notification-log.jsonl in dataDir.
 */
export async function dispatchWebhooks(
  webhooks: WebhookEntry[],
  evt: WebhookEvent,
  dataDir?: string,
): Promise<DispatchResult[]> {
  if (webhooks.length === 0) return [];

  const results = await Promise.allSettled(
    webhooks.map(async (wh) => {
      const body = formatPayload(wh.url, evt);
      const res = await fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { url: wh.url, success: res.ok, statusCode: res.status };
    }),
  );

  const dispatched: DispatchResult[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { url: webhooks[i].url, success: false, error: String((r as PromiseRejectedResult).reason) },
  );

  // Log to notification log (non-blocking)
  if (dataDir) {
    appendNotificationLog(dataDir, evt, dispatched).catch((err) => {
      console.error("[webhook-dispatch] log error:", err);
    });
  }

  return dispatched;
}

/** Append dispatch results to notification-log.jsonl */
async function appendNotificationLog(
  dataDir: string,
  evt: WebhookEvent,
  results: DispatchResult[],
): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const logPath = path.join(dataDir, "notification-log.jsonl");
  const timestamp = new Date().toISOString();
  const lines = results.map((r) =>
    JSON.stringify({
      timestamp,
      event: evt.event,
      title: evt.title,
      webhookUrl: r.url,
      success: r.success,
      statusCode: r.statusCode,
      error: r.error,
    }),
  );
  await fs.appendFile(logPath, lines.join("\n") + "\n");
}
