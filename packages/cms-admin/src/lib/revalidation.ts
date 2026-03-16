/**
 * Revalidation dispatcher — sends signed webhooks to sites after content changes.
 *
 * After CMS commits content (via filesystem or GitHub API), this module
 * dispatches an HMAC-SHA256 signed POST to the site's revalidateUrl,
 * triggering on-demand revalidation of changed paths.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getActiveSitePaths } from "./site-paths";

// ─── Types ────────────────────────────────────────────────

export interface RevalidationPayload {
  collection: string;
  slug: string;
  action: "created" | "updated" | "deleted" | "published" | "unpublished";
}

export interface RevalidationResult {
  ok: boolean;
  status?: number;
  error?: string;
  durationMs?: number;
}

interface RevalidationLogEntry {
  timestamp: string;
  url: string;
  paths: string[];
  collection: string;
  slug: string;
  action: string;
  status: number | null;
  ok: boolean;
  error?: string;
  durationMs: number;
}

// ─── Path computation ─────────────────────────────────────

interface SiteEntryLike {
  revalidateUrl?: string;
  revalidateSecret?: string;
  id?: string;
}

/**
 * Compute which paths should be revalidated for a given content change.
 * Uses urlPrefix from collection config if available.
 */
function computePaths(collection: string, slug: string, urlPrefix?: string): string[] {
  const prefix = urlPrefix ?? `/${collection}`;
  const paths = [`${prefix}/${slug}`, prefix];
  // Always revalidate homepage for pages collection or index/homepage slugs
  if (collection === "pages" || collection === "global" || slug === "index" || slug === "home" || slug === "homepage") {
    paths.push("/");
  }
  return [...new Set(paths)];
}

// ─── Dispatch ─────────────────────────────────────────────

export async function dispatchRevalidation(
  site: SiteEntryLike,
  payload: RevalidationPayload,
  urlPrefix?: string,
): Promise<RevalidationResult> {
  if (!site.revalidateUrl) return { ok: true }; // No URL configured — skip silently

  const paths = computePaths(payload.collection, payload.slug, urlPrefix);

  const body = JSON.stringify({
    event: "content.revalidate",
    timestamp: new Date().toISOString(),
    site: site.id ?? "unknown",
    paths,
    collection: payload.collection,
    slug: payload.slug,
    action: payload.action,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-CMS-Event": "content.revalidate",
  };

  if (site.revalidateSecret) {
    const signature = crypto
      .createHmac("sha256", site.revalidateSecret)
      .update(body)
      .digest("hex");
    headers["X-CMS-Signature"] = `sha256=${signature}`;
  }

  const start = Date.now();

  try {
    const res = await fetch(site.revalidateUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const result: RevalidationResult = {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
    };

    // Log asynchronously — don't block the response
    logRevalidation(site.revalidateUrl, paths, payload, result).catch(() => {});

    return result;
  } catch (err) {
    const result: RevalidationResult = {
      ok: false,
      error: String(err),
      durationMs: Date.now() - start,
    };
    logRevalidation(site.revalidateUrl, paths, payload, result).catch(() => {});
    return result;
  }
}

// ─── Delivery log ─────────────────────────────────────────

const MAX_LOG_ENTRIES = 50;

async function getLogPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "revalidation-log.json");
}

async function logRevalidation(
  url: string,
  paths: string[],
  payload: RevalidationPayload,
  result: RevalidationResult,
): Promise<void> {
  const logPath = await getLogPath();
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  let entries: RevalidationLogEntry[] = [];
  try {
    entries = JSON.parse(await fs.readFile(logPath, "utf-8"));
  } catch { /* first write */ }

  entries.unshift({
    timestamp: new Date().toISOString(),
    url,
    paths,
    collection: payload.collection,
    slug: payload.slug,
    action: payload.action,
    status: result.status ?? null,
    ok: result.ok,
    error: result.error,
    durationMs: result.durationMs ?? 0,
  });

  // Keep only the last N entries
  if (entries.length > MAX_LOG_ENTRIES) {
    entries = entries.slice(0, MAX_LOG_ENTRIES);
  }

  await fs.writeFile(logPath, JSON.stringify(entries, null, 2));
}

/**
 * Read the revalidation delivery log for the active site.
 */
export async function readRevalidationLog(): Promise<RevalidationLogEntry[]> {
  const logPath = await getLogPath();
  try {
    return JSON.parse(await fs.readFile(logPath, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Send a test ping to the site's revalidation endpoint.
 */
export async function sendTestPing(site: SiteEntryLike): Promise<RevalidationResult> {
  return dispatchRevalidation(site, {
    collection: "_test",
    slug: "ping",
    action: "updated",
  });
}
