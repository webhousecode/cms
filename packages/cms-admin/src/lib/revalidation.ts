/**
 * Revalidation dispatcher — sends signed webhooks to sites after content changes.
 *
 * After CMS commits content (via filesystem or GitHub API), this module
 * dispatches an HMAC-SHA256 signed POST to the site's revalidateUrl,
 * triggering on-demand revalidation of changed paths.
 *
 * Reliability model (added 2026-05-06):
 *   - Sync attempt with 5s timeout — caller receives this result
 *     immediately (drives auto-deploy fallback decision).
 *   - On sync failure, async retries fire in the background:
 *     +1s, +4s, +16s with the same payload. Each attempt logged.
 *   - If all retries fail and schedulerNotifications is enabled,
 *     a Discord-formatted alert is POSTed to schedulerWebhookUrl.
 *
 * Why fire-and-forget retries: synchronous retry would hang the
 * editor's save request for ~21s when the live site is unreachable.
 * The user wants their save to feel snappy; the retries exist to make
 * eventual delivery reliable, not to block the editor UI.
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
  document?: unknown | null; // Full document JSON for content push (any serializable shape)
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
  /** Attempt number (1 = sync, 2-4 = async retries). */
  attempt?: number;
}

// ─── Path computation ─────────────────────────────────────

interface SiteEntryLike {
  revalidateUrl?: string;
  revalidateSecret?: string;
  id?: string;
  /** Optional human label for alerts. Falls back to id. */
  name?: string;
}

/**
 * Compute which paths should be revalidated for a given content change.
 * Uses urlPrefix from collection config if available.
 */
function computePaths(collection: string, slug: string, urlPrefix?: string, collectionKind?: string): string[] {
  const prefix = urlPrefix ?? `/${collection}`;
  const paths = [`${prefix}/${slug}`, prefix];
  // Revalidate homepage for collections that affect site-wide rendering
  // (pages/global kinds) or common homepage slug names. Uses collection KIND
  // (config-level), not NAME, so users can name their collections freely.
  const kind = collectionKind ?? (collection === "pages" ? "page" : undefined);
  if (kind === "global" || collection === "pages" || slug === "index" || slug === "home" || slug === "homepage") {
    paths.push("/");
  }
  return [...new Set(paths)];
}

// ─── Single attempt ───────────────────────────────────────

const SYNC_TIMEOUT_MS = 5_000;
const RETRY_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 4_000, 16_000];

interface AttemptOptions {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
  /** Inject fetch for tests. */
  fetchImpl?: typeof fetch;
}

async function attemptRevalidation(opts: AttemptOptions): Promise<RevalidationResult> {
  const start = Date.now();
  const fetchFn = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(opts.url, {
      method: "POST",
      headers: opts.headers,
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    return {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ─── Public dispatch ──────────────────────────────────────

export interface DispatchOptions {
  /** Override retry backoff in ms. Default [1000, 4000, 16000]. */
  retryDelaysMs?: number[];
  /** Inject fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Skip async retries (tests + sendTestPing). */
  syncOnly?: boolean;
  /** Override scheduler timer for tests — defaults to setTimeout. */
  scheduleAfter?: (ms: number, fn: () => void) => void;
}

export async function dispatchRevalidation(
  site: SiteEntryLike,
  payload: RevalidationPayload,
  urlPrefix?: string,
  options?: DispatchOptions,
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
    document: payload.document ?? null,
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

  const url = site.revalidateUrl;
  const result = await attemptRevalidation({
    url,
    body,
    headers,
    timeoutMs: SYNC_TIMEOUT_MS,
    ...(options?.fetchImpl && { fetchImpl: options.fetchImpl }),
  });

  // Log first attempt
  logRevalidation(url, paths, payload, result, 1)
    .catch((e) => console.warn("[revalidation] log write failed:", e));

  // On failure (and not syncOnly mode), schedule async retries
  if (!result.ok && !options?.syncOnly) {
    scheduleAsyncRetries({
      site,
      url,
      body,
      headers,
      paths,
      payload,
      retryDelaysMs: options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
      ...(options?.fetchImpl && { fetchImpl: options.fetchImpl }),
      ...(options?.scheduleAfter && { scheduleAfter: options.scheduleAfter }),
    });
  }

  return result;
}

// ─── Async retries ────────────────────────────────────────

interface RetryPlan {
  site: SiteEntryLike;
  url: string;
  body: string;
  headers: Record<string, string>;
  paths: string[];
  payload: RevalidationPayload;
  retryDelaysMs: number[];
  fetchImpl?: typeof fetch;
  scheduleAfter?: (ms: number, fn: () => void) => void;
}

function scheduleAsyncRetries(plan: RetryPlan): void {
  const scheduler = plan.scheduleAfter ?? ((ms, fn) => { setTimeout(fn, ms).unref?.(); });
  // Fire-and-forget retry chain. Each retry awaits its own attempt then
  // chains the next via the scheduler callback. The chain bottoms out
  // either on success or on alert dispatch.
  let attemptIdx = 0; // 0 = first retry (= overall attempt #2), etc.
  const tryNext = () => {
    if (attemptIdx >= plan.retryDelaysMs.length) {
      // All retries exhausted — fire alert
      sendRevalidationAlert(plan).catch((e) =>
        console.warn("[revalidation] alert dispatch failed:", e),
      );
      return;
    }
    const delay = plan.retryDelaysMs[attemptIdx]!;
    const overallAttempt = attemptIdx + 2;
    attemptIdx++;
    scheduler(delay, () => {
      void attemptRevalidation({
        url: plan.url,
        body: plan.body,
        headers: plan.headers,
        timeoutMs: RETRY_TIMEOUT_MS,
        ...(plan.fetchImpl && { fetchImpl: plan.fetchImpl }),
      }).then((result) => {
        logRevalidation(plan.url, plan.paths, plan.payload, result, overallAttempt)
          .catch((e) => console.warn("[revalidation] log write failed:", e));
        if (result.ok) return; // Done — eventual delivery achieved
        tryNext();
      });
    });
  };
  tryNext();
}

// ─── Discord-style alert ──────────────────────────────────

async function sendRevalidationAlert(plan: RetryPlan): Promise<void> {
  // Read scheduler webhook from active site config. Skip silently if
  // notifications are off or webhook not set — we already logged every
  // failed attempt to revalidation-log.json so the audit trail exists.
  let webhookUrl = "";
  let notificationsEnabled = false;
  try {
    const { readSiteConfig } = await import("./site-config");
    const cfg = await readSiteConfig();
    webhookUrl = cfg.schedulerWebhookUrl ?? "";
    notificationsEnabled = !!cfg.schedulerNotifications;
  } catch {
    // No site config available — nothing to do
    return;
  }

  if (!notificationsEnabled || !webhookUrl) {
    console.warn(
      `[revalidation] all retries exhausted for ${plan.site.id ?? "unknown"}/${plan.payload.collection}/${plan.payload.slug} — no alert webhook configured`,
    );
    return;
  }

  const totalAttempts = plan.retryDelaysMs.length + 1;
  const siteLabel = plan.site.name ?? plan.site.id ?? "unknown";
  const message =
    `:rotating_light: **ICD revalidation failed** — ${siteLabel}\n` +
    `Collection: \`${plan.payload.collection}\`  ` +
    `Slug: \`${plan.payload.slug}\`  ` +
    `Action: \`${plan.payload.action}\`\n` +
    `Webhook URL: \`${plan.url}\`\n` +
    `Attempts: ${totalAttempts} (sync + ${plan.retryDelaysMs.length} retries)\n` +
    `Time: ${new Date().toISOString()}\n` +
    `Live site is now stale for the affected paths until the next successful revalidate. ` +
    `Check Site Settings → Revalidation log for the latest attempt error.`;

  // Fire-and-forget alert. One quick try, no retries on the alert
  // itself — if Discord is also down we accept the loss rather than
  // building yet another retry chain.
  const fetchFn = plan.fetchImpl ?? fetch;
  try {
    await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    console.warn("[revalidation] alert webhook failed:", e);
  }
}

// ─── Delivery log ─────────────────────────────────────────

const MAX_LOG_ENTRIES = 1000;

async function getLogPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "revalidation-log.json");
}

// Module-level write chain — serializes log writes per process so that
// concurrent dispatches (sync attempt + 3 async retries firing close
// together) don't race on the read-modify-write cycle and clobber
// each other's entries. Each call appends a tail-promise to the chain
// and awaits its turn.
let logWriteChain: Promise<void> = Promise.resolve();

function logRevalidation(
  url: string,
  paths: string[],
  payload: RevalidationPayload,
  result: RevalidationResult,
  attempt: number,
): Promise<void> {
  const next = logWriteChain.then(async () => {
    const logPath = await getLogPath();
    await fs.mkdir(path.dirname(logPath), { recursive: true });

    let entries: RevalidationLogEntry[] = [];
    try {
      entries = JSON.parse(await fs.readFile(logPath, "utf-8"));
    } catch { /* first write */ }

    const entry: RevalidationLogEntry = {
      timestamp: new Date().toISOString(),
      url,
      paths,
      collection: payload.collection,
      slug: payload.slug,
      action: payload.action,
      status: result.status ?? null,
      ok: result.ok,
      durationMs: result.durationMs ?? 0,
      attempt,
    };
    if (result.error) entry.error = result.error;
    entries.unshift(entry);

    // Keep only the last N entries
    if (entries.length > MAX_LOG_ENTRIES) {
      entries = entries.slice(0, MAX_LOG_ENTRIES);
    }

    await fs.writeFile(logPath, JSON.stringify(entries, null, 2));
  });
  // Swallow errors at the chain level so one failed write doesn't poison
  // every subsequent write. Caller's .catch() still surfaces it.
  logWriteChain = next.catch(() => {});
  return next;
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
 * Sync-only — no async retries, no alerts (test pings are diagnostic
 * and the user is watching the result live).
 */
export async function sendTestPing(site: SiteEntryLike): Promise<RevalidationResult> {
  return dispatchRevalidation(
    site,
    { collection: "_test", slug: "ping", action: "updated" },
    undefined,
    { syncOnly: true },
  );
}
