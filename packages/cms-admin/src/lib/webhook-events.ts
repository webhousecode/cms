/**
 * F35 — Higher-level webhook event dispatchers.
 *
 * Small helpers that wrap the low-level webhook-dispatch for specific
 * event categories (content, agent, deploy, media). Handles loading
 * the site + org settings, resolving the effective webhook list, and
 * building the event payload.
 *
 * Call these fire-and-forget from anywhere in the codebase:
 *   fireContentEvent("published", collection, slug, doc, actor).catch(() => {});
 */
import { dispatchWebhooks, type WebhookEvent } from "./webhook-dispatch";
import { resolveWebhooks, type WebhookCategory } from "./webhook-sources";
import { getActiveSitePaths, getActiveSiteEntry } from "./site-paths";
import { readSiteConfig } from "./site-config";
import { readOrgSettingsForOrg } from "./org-settings";

async function loadSources(category: WebhookCategory) {
  try {
    const [siteConfig, sitePaths, siteEntry] = await Promise.all([
      readSiteConfig().catch(() => null),
      getActiveSitePaths().catch(() => null),
      getActiveSiteEntry().catch(() => null),
    ]);

    // Resolve org settings for inheritance
    let orgSettings = null;
    try {
      // Read the active org ID from cookies — only works in request context
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const orgId = cookieStore.get("cms-active-org")?.value;
      if (orgId) {
        orgSettings = await readOrgSettingsForOrg(orgId).catch(() => null);
      }
    } catch {
      /* not in a request context */
    }

    const webhooks = resolveWebhooks(category, siteConfig, orgSettings);
    return {
      webhooks,
      dataDir: sitePaths?.dataDir,
      siteName: siteEntry?.name,
      siteId: siteEntry?.id,
    };
  } catch {
    return { webhooks: [], dataDir: undefined, siteName: undefined, siteId: undefined };
  }
}

/**
 * Content lifecycle event.
 * Action: created, updated, published, unpublished, trashed, restored, cloned
 */
export async function fireContentEvent(
  action: "created" | "updated" | "published" | "unpublished" | "trashed" | "restored" | "cloned",
  collection: string,
  slug: string,
  doc?: { id?: string; slug?: string; status?: string; data?: unknown } | Record<string, unknown>,
  actor?: string,
): Promise<void> {
  const src = await loadSources("content");
  if (src.webhooks.length === 0) return;

  const data = (doc as { data?: unknown } | undefined)?.data;
  const title = (data as { title?: string } | undefined)?.title ?? slug;
  const color = action === "published" ? 0x22c55e
    : action === "unpublished" || action === "trashed" ? 0xef4444
    : action === "restored" ? 0x3b82f6
    : 0xF7BB2E;

  const evt: WebhookEvent = {
    event: `content.${action}`,
    title: `${action.charAt(0).toUpperCase() + action.slice(1)}: ${title}`,
    message: `${collection}/${slug} was ${action}`,
    color,
    fields: [
      { name: "Collection", value: collection },
      { name: "Slug", value: slug },
      { name: "Action", value: action },
    ],
    siteName: src.siteName,
    actor,
    data: doc as Record<string, unknown> | undefined,
  };

  dispatchWebhooks(src.webhooks, evt, src.dataDir).catch(() => {});
}

/**
 * Agent lifecycle event. Action: started, completed, failed
 */
export async function fireAgentEvent(
  action: "started" | "completed" | "failed",
  agentName: string,
  details?: {
    targetCollection?: string;
    documentsCreated?: number;
    costUsd?: number;
    error?: string;
    /** Title of the document the agent produced (for richer embeds). */
    documentTitle?: string;
    /** Slug of the produced document (used to build a preview link). */
    documentSlug?: string;
    /** Public URL of any image the agent generated for this run. */
    imageUrl?: string;
    /** Public URL the embed title should link to (e.g. preview URL). */
    linkUrl?: string;
  },
  actor?: string,
): Promise<void> {
  const src = await loadSources("agent");
  if (src.webhooks.length === 0) return;

  const color = action === "completed" ? 0x22c55e : action === "failed" ? 0xef4444 : 0xF7BB2E;
  const fields: { name: string; value: string }[] = [{ name: "Agent", value: agentName }];
  if (details?.documentTitle) fields.push({ name: "Document", value: details.documentTitle });
  if (details?.targetCollection) fields.push({ name: "Collection", value: details.targetCollection });
  if (details?.documentSlug) fields.push({ name: "Slug", value: details.documentSlug });
  if (details?.documentsCreated !== undefined) fields.push({ name: "Documents", value: String(details.documentsCreated) });
  if (details?.costUsd !== undefined) fields.push({ name: "Cost", value: `$${details.costUsd.toFixed(4)}` });
  if (details?.imageUrl) fields.push({ name: "Generated image", value: details.imageUrl });
  if (details?.error) fields.push({ name: "Error", value: details.error });

  // Build a richer message body so the embed isn't just a price tag.
  const messageParts: string[] = [];
  if (action === "failed" && details?.error) {
    messageParts.push(details.error);
  } else {
    if (details?.documentTitle) {
      messageParts.push(`**${details.documentTitle}**`);
    }
    if (details?.targetCollection) {
      messageParts.push(`in \`${details.targetCollection}\``);
    }
    if (messageParts.length === 0) {
      messageParts.push(`Agent "${agentName}" ${action}`);
    }
  }

  const evt: WebhookEvent = {
    event: `agent.${action}`,
    title: details?.documentTitle
      ? `${agentName} → ${details.documentTitle}`
      : `Agent ${action}: ${agentName}`,
    message: messageParts.join(" "),
    color,
    fields,
    siteName: src.siteName,
    actor,
    imageUrl: details?.imageUrl,
    linkUrl: details?.linkUrl,
  };

  dispatchWebhooks(src.webhooks, evt, src.dataDir).catch(() => {});
}

/**
 * Deploy lifecycle event. Action: started, success, failed
 */
export async function fireDeployEvent(
  action: "started" | "success" | "failed",
  provider: string,
  details?: { url?: string; durationMs?: number; error?: string },
  actor?: string,
): Promise<void> {
  const src = await loadSources("deploy");
  if (src.webhooks.length === 0) return;

  const color = action === "success" ? 0x22c55e : action === "failed" ? 0xef4444 : 0xF7BB2E;
  const fields: { name: string; value: string }[] = [{ name: "Provider", value: provider }];
  if (details?.url) fields.push({ name: "URL", value: details.url });
  if (details?.durationMs !== undefined) fields.push({ name: "Duration", value: `${(details.durationMs / 1000).toFixed(1)}s` });
  if (details?.error) fields.push({ name: "Error", value: details.error });

  const evt: WebhookEvent = {
    event: `deploy.${action}`,
    title: `Deploy ${action}: ${provider}`,
    message: action === "failed" && details?.error ? details.error : `Deploy to ${provider} ${action}`,
    color,
    fields,
    siteName: src.siteName,
    actor,
  };

  dispatchWebhooks(src.webhooks, evt, src.dataDir).catch(() => {});
}

/**
 * Media lifecycle event. Action: uploaded, deleted
 */
export async function fireMediaEvent(
  action: "uploaded" | "deleted",
  filename: string,
  details?: { size?: number; mimeType?: string },
  actor?: string,
): Promise<void> {
  const src = await loadSources("media");
  if (src.webhooks.length === 0) return;

  const color = action === "deleted" ? 0xef4444 : 0xF7BB2E;
  const fields: { name: string; value: string }[] = [{ name: "File", value: filename }];
  if (details?.mimeType) fields.push({ name: "Type", value: details.mimeType });
  if (details?.size !== undefined) fields.push({ name: "Size", value: `${(details.size / 1024).toFixed(1)} KB` });

  const evt: WebhookEvent = {
    event: `media.${action}`,
    title: `Media ${action}: ${filename}`,
    message: `File ${filename} was ${action}`,
    color,
    fields,
    siteName: src.siteName,
    actor,
  };

  dispatchWebhooks(src.webhooks, evt, src.dataDir).catch(() => {});
}
