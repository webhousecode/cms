import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Inline implementation of the dispatch logic (tested before real impl) ──

interface WebhookEntry { id: string; url: string }

interface WebhookEvent {
  event: string;
  title: string;
  message: string;
  color?: number;
  fields?: { name: string; value: string }[];
  orgName?: string;
  siteName?: string;
  instanceUrl?: string;
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

interface DispatchResult {
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

async function dispatchWebhooks(
  webhooks: WebhookEntry[],
  evt: WebhookEvent,
  fetchFn: typeof fetch = fetch,
): Promise<DispatchResult[]> {
  if (webhooks.length === 0) return [];
  const results = await Promise.allSettled(
    webhooks.map(async (wh) => {
      const body = formatPayload(wh.url, evt);
      const res = await fetchFn(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { url: wh.url, success: res.ok, statusCode: res.status };
    }),
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { url: webhooks[i].url, success: false, error: String((r as PromiseRejectedResult).reason) },
  );
}

// ── Tests ──────────────────────────────────────────────────────

describe("Webhook Dispatch", () => {
  const baseEvent: WebhookEvent = {
    event: "backup.completed",
    title: "Backup Complete",
    message: "Created backup-2026-03-28.zip with 42 documents.",
    color: 0x4ade80,
    fields: [
      { name: "File", value: "backup-2026-03-28.zip" },
      { name: "Documents", value: "42" },
    ],
    orgName: "Webhouse",
    siteName: "Blog",
    instanceUrl: "localhost:3010",
  };

  describe("formatPayload", () => {
    it("formats Discord embed for Discord webhook URL", () => {
      const payload = formatPayload("https://discord.com/api/webhooks/123/abc", baseEvent) as any;
      expect(payload.content).toContain("backup.completed");
      expect(payload.content).toContain("Blog");
      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toBe("Backup Complete");
      expect(payload.embeds[0].description).toContain("42 documents");
      expect(payload.embeds[0].color).toBe(0x4ade80);
      expect(payload.embeds[0].fields).toHaveLength(2);
      expect(payload.embeds[0].footer.text).toContain("webhouse.app");
    });

    it("formats Discord embed for discordapp.com URL", () => {
      const payload = formatPayload("https://discordapp.com/api/webhooks/123/abc", baseEvent) as any;
      expect(payload.embeds).toHaveLength(1);
    });

    it("formats Slack block for Slack webhook URL", () => {
      const payload = formatPayload("https://hooks.slack.com/services/T/B/x", baseEvent) as any;
      expect(payload.text).toContain("*Backup Complete*");
      expect(payload.text).toContain("Blog");
      expect(payload.text).toContain("File:");
      expect(payload.text).toContain("Documents:");
    });

    it("formats generic JSON for unknown URLs", () => {
      const payload = formatPayload("https://example.com/hook", baseEvent) as any;
      expect(payload.event).toBe("backup.completed");
      expect(payload.title).toBe("Backup Complete");
      expect(payload.message).toContain("42 documents");
      expect(payload.fields).toHaveLength(2);
      expect(payload.org).toBe("Webhouse");
      expect(payload.site).toBe("Blog");
    });

    it("uses default gold color when color is not specified", () => {
      const evt = { ...baseEvent, color: undefined };
      const payload = formatPayload("https://discord.com/api/webhooks/1/a", evt) as any;
      expect(payload.embeds[0].color).toBe(0xF7BB2E);
    });

    it("handles missing orgName and siteName gracefully", () => {
      const evt = { ...baseEvent, orgName: undefined, siteName: undefined };
      const discord = formatPayload("https://discord.com/api/webhooks/1/a", evt) as any;
      expect(discord.content).toContain("—");
      const slack = formatPayload("https://hooks.slack.com/services/T/B/x", evt) as any;
      expect(slack.text).toContain("—");
    });

    it("handles empty fields array", () => {
      const evt = { ...baseEvent, fields: [] };
      const payload = formatPayload("https://discord.com/api/webhooks/1/a", evt) as any;
      expect(payload.embeds[0].fields).toBeUndefined();
    });
  });

  describe("dispatchWebhooks", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    });

    it("returns empty array for empty webhooks list", async () => {
      const results = await dispatchWebhooks([], baseEvent, mockFetch);
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("dispatches to all webhooks in parallel", async () => {
      const webhooks: WebhookEntry[] = [
        { id: "1", url: "https://discord.com/api/webhooks/1/a" },
        { id: "2", url: "https://hooks.slack.com/services/T/B/x" },
        { id: "3", url: "https://example.com/hook" },
      ];
      const results = await dispatchWebhooks(webhooks, baseEvent, mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it("reports failure for individual webhook without blocking others", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const webhooks: WebhookEntry[] = [
        { id: "1", url: "https://example.com/a" },
        { id: "2", url: "https://example.com/b" },
        { id: "3", url: "https://example.com/c" },
      ];
      const results = await dispatchWebhooks(webhooks, baseEvent, mockFetch);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("Connection refused");
      expect(results[2].success).toBe(true);
    });

    it("reports HTTP error status codes", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const webhooks: WebhookEntry[] = [{ id: "1", url: "https://example.com/hook" }];
      const results = await dispatchWebhooks(webhooks, baseEvent, mockFetch);
      expect(results[0].success).toBe(false);
      expect(results[0].statusCode).toBe(404);
    });

    it("sends correct format per webhook URL type", async () => {
      const webhooks: WebhookEntry[] = [
        { id: "1", url: "https://discord.com/api/webhooks/1/a" },
        { id: "2", url: "https://hooks.slack.com/services/T/B/x" },
        { id: "3", url: "https://example.com/hook" },
      ];
      await dispatchWebhooks(webhooks, baseEvent, mockFetch);

      // Discord
      const discordBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(discordBody.embeds).toBeDefined();

      // Slack
      const slackBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(slackBody.text).toBeDefined();
      expect(slackBody.embeds).toBeUndefined();

      // Generic
      const genericBody = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(genericBody.event).toBe("backup.completed");
      expect(genericBody.embeds).toBeUndefined();
      expect(genericBody.text).toBeUndefined();
    });
  });
});
