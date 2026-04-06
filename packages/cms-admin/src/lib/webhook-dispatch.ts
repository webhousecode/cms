/**
 * F13 + F35 — Shared webhook dispatcher for all CMS automation events.
 *
 * Detects Discord/Slack URLs and formats accordingly, otherwise sends generic JSON.
 * Dispatches to all webhooks in parallel; one failure doesn't block others.
 *
 * F35 additions:
 * - HMAC-SHA256 signing when `secret` is configured per webhook
 * - Retry with exponential backoff (3 attempts: 0s, 30s, 5min) for generic webhooks
 * - Delivery log in _data/webhook-deliveries.jsonl (rolling 500 entries)
 * - X-Webhook-* headers for machine consumers
 *
 * Used by: scheduler-notify (publish), tools-scheduler (backup, link check),
 * agent-runner, content lifecycle hooks, deploy service.
 */
import crypto from "node:crypto";

export interface WebhookEntry {
  id: string;
  url: string;
  /** Optional HMAC signing secret (F35) */
  secret?: string;
  /** Optional label for the delivery log */
  label?: string;
}

export interface WebhookEvent {
  event: string;
  title: string;
  message: string;
  color?: number;
  fields?: { name: string; value: string }[];
  orgName?: string;
  siteName?: string;
  instanceUrl?: string;
  /** Optional raw document for machine consumers (generic webhooks only) */
  data?: Record<string, unknown>;
  /** Optional actor identifier (e.g. "user:admin@example.com") */
  actor?: string;
}

export interface DispatchResult {
  url: string;
  webhookId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
  deliveryId: string;
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
    actor: evt.actor,
    data: evt.data,
  };
}

function formatPayload(url: string, evt: WebhookEvent): Record<string, unknown> {
  if (isDiscordUrl(url)) return formatDiscord(evt);
  if (isSlackUrl(url)) return formatSlack(evt);
  return formatGeneric(evt);
}

/** HMAC-SHA256 signature, hex encoded */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Generate a unique delivery ID */
function makeDeliveryId(): string {
  return `del_${crypto.randomBytes(8).toString("hex")}`;
}

/** Sleep helper for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry delays in ms: immediate, 30s, 5min */
const RETRY_DELAYS = [0, 30_000, 300_000];

/**
 * Deliver a single webhook with retry + HMAC signing.
 * Only generic webhooks use retry; Discord/Slack are best-effort.
 */
async function deliverSingle(
  wh: WebhookEntry,
  evt: WebhookEvent,
): Promise<DispatchResult> {
  const deliveryId = makeDeliveryId();
  const body = formatPayload(wh.url, evt);
  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "webhouse-cms/1.0",
  };

  // Only generic webhooks get X-Webhook-* headers and retry
  const isGeneric = !isDiscordUrl(wh.url) && !isSlackUrl(wh.url);
  if (isGeneric) {
    headers["X-Webhook-Event"] = evt.event;
    headers["X-Webhook-Id"] = wh.id;
    headers["X-Webhook-Delivery"] = deliveryId;
    if (wh.secret) {
      headers["X-Webhook-Signature"] = `sha256=${signPayload(bodyStr, wh.secret)}`;
    }
  }

  const maxAttempts = isGeneric ? RETRY_DELAYS.length : 1;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) {
      await sleep(RETRY_DELAYS[attempt]);
    }
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(15_000), // 15s timeout
      });
      lastStatus = res.status;
      if (res.ok) {
        return {
          url: wh.url,
          webhookId: wh.id,
          success: true,
          statusCode: res.status,
          attempts: attempt + 1,
          deliveryId,
        };
      }
      // 4xx errors don't get retried
      if (res.status >= 400 && res.status < 500) {
        lastError = `HTTP ${res.status}`;
        break;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    url: wh.url,
    webhookId: wh.id,
    success: false,
    statusCode: lastStatus,
    error: lastError ?? "Delivery failed",
    attempts: maxAttempts,
    deliveryId,
  };
}

/**
 * Dispatch a webhook event to all configured webhooks.
 * Returns results for each webhook (success/failure).
 * Optionally logs to webhook-deliveries.jsonl in dataDir.
 */
export async function dispatchWebhooks(
  webhooks: WebhookEntry[],
  evt: WebhookEvent,
  dataDir?: string,
): Promise<DispatchResult[]> {
  if (webhooks.length === 0) return [];

  // Fire all webhooks in parallel (including retries internally)
  const results = await Promise.allSettled(webhooks.map((wh) => deliverSingle(wh, evt)));

  const dispatched: DispatchResult[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          url: webhooks[i].url,
          webhookId: webhooks[i].id,
          success: false,
          error: String((r as PromiseRejectedResult).reason),
          attempts: 1,
          deliveryId: makeDeliveryId(),
        },
  );

  // Log to delivery log (non-blocking)
  if (dataDir) {
    appendDeliveryLog(dataDir, evt, dispatched).catch((err) => {
      console.error("[webhook-dispatch] log error:", err);
    });
  }

  return dispatched;
}

/** Append dispatch results to webhook-deliveries.jsonl (rolling 500 entries) */
async function appendDeliveryLog(
  dataDir: string,
  evt: WebhookEvent,
  results: DispatchResult[],
): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const logPath = path.join(dataDir, "webhook-deliveries.jsonl");
  const legacyLogPath = path.join(dataDir, "notification-log.jsonl");
  const timestamp = new Date().toISOString();
  const lines = results.map((r) =>
    JSON.stringify({
      timestamp,
      deliveryId: r.deliveryId,
      webhookId: r.webhookId,
      event: evt.event,
      title: evt.title,
      webhookUrl: r.url,
      success: r.success,
      statusCode: r.statusCode,
      attempts: r.attempts,
      error: r.error,
    }),
  );

  await fs.appendFile(logPath, lines.join("\n") + "\n");
  // Also write to legacy notification-log.jsonl for backwards compatibility
  await fs.appendFile(legacyLogPath, lines.join("\n") + "\n").catch(() => {});

  // Roll log if it exceeds 500 entries
  try {
    const content = await fs.readFile(logPath, "utf-8");
    const allLines = content.trim().split("\n").filter(Boolean);
    if (allLines.length > 500) {
      const trimmed = allLines.slice(-500).join("\n") + "\n";
      await fs.writeFile(logPath, trimmed);
    }
  } catch { /* ignore */ }
}
