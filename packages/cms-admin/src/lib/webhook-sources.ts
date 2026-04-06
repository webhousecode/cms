/**
 * F35 — Webhook source resolver.
 *
 * Merges site-level + org-level webhooks for a given event category
 * so org-wide defaults fire alongside site-specific webhooks.
 *
 * Deduplicates by URL so the same webhook doesn't fire twice if set
 * in both org settings and site settings.
 */
import type { SiteConfig } from "./site-config";
import type { OrgSettings } from "./org-settings";
import type { WebhookEntry } from "./webhook-dispatch";

export type WebhookCategory =
  | "content"
  | "publish"
  | "backup"
  | "linkCheck"
  | "agent"
  | "deploy"
  | "media";

const SITE_KEYS: Record<WebhookCategory, keyof SiteConfig> = {
  content: "contentWebhooks",
  publish: "publishWebhooks",
  backup: "backupWebhooks",
  linkCheck: "linkCheckWebhooks",
  agent: "agentDefaultWebhooks",
  deploy: "deployWebhooks",
  media: "mediaWebhooks",
};

const ORG_KEYS: Record<WebhookCategory, keyof OrgSettings> = {
  content: "contentWebhooks",
  publish: "publishWebhooks",
  backup: "backupWebhooks",
  linkCheck: "linkCheckWebhooks",
  agent: "agentDefaultWebhooks",
  deploy: "deployWebhooks",
  media: "mediaWebhooks",
};

/**
 * Resolve the effective webhook list for a category by merging
 * org-level + site-level webhooks. Site entries override org entries
 * on duplicate URLs (so site secret takes priority).
 */
export function resolveWebhooks(
  category: WebhookCategory,
  siteConfig: SiteConfig | null | undefined,
  orgSettings: OrgSettings | null | undefined,
): WebhookEntry[] {
  const siteKey = SITE_KEYS[category];
  const orgKey = ORG_KEYS[category];

  const siteList = ((siteConfig?.[siteKey] ?? []) as WebhookEntry[]) || [];
  const orgList = ((orgSettings?.[orgKey] ?? []) as WebhookEntry[]) || [];

  const seen = new Set<string>();
  const merged: WebhookEntry[] = [];

  // Site first — site config wins on duplicate URL
  for (const w of siteList) {
    if (!w?.url) continue;
    seen.add(w.url);
    merged.push(w);
  }
  for (const w of orgList) {
    if (!w?.url || seen.has(w.url)) continue;
    merged.push(w);
  }

  return merged;
}
