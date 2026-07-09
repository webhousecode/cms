/**
 * Server-side generation + pre-warm for the quick-action cache (F158).
 *
 * The cache in quick-cache.ts is passive (peek/store). This module fills it:
 *   - generateQuickAnswer(key, siteId): self-fetch the streaming chat with the
 *     service token, accumulate the SSE `text` deltas into the finished
 *     markdown, then store it via the /quick/:key endpoint. Reuses the EXACT
 *     shipped chat engine — zero logic duplication, no naked cutover.
 *   - scheduleLazyRegen(key, siteId): a cold GET schedules a background regen
 *     (deduped) so the NEXT click is instant.
 *   - invalidateQuickCacheOnWrite(): a content/schema/settings write drops the
 *     content-dependent entries now and schedules a debounced pre-warm.
 *
 * Everything is guarded on CMS_JWT_SECRET (the service token). With no token
 * the module ships dark: generation no-ops, the endpoint just serves whatever
 * is (or isn't) cached. Nothing here ever throws into a caller — a failed
 * pre-warm must never break the content write or the peek that triggered it.
 *
 * Both HTTP calls carry `?site=<id>`, so proxy.ts injects the correct
 * cms-active-* cookies and the store lands in the right tenant's dataDir — no
 * cookie-less in-process path resolution (which would mis-route a detached
 * background job to the registry default site).
 */
import { QUICK_ACTIONS, quickActionByKey } from "@/lib/chat/quick-actions";
import { invalidateContentQuick } from "@/lib/chat/quick-cache";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { parseChatSseText } from "./quick-sse";

export { parseChatSseText };

const selfBase = () =>
  process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;

/** The internal service token (== CMS_JWT_SECRET). Absent → ship dark. */
const serviceToken = (): string | undefined => process.env.CMS_JWT_SECRET;

const CHAT_TIMEOUT_MS = 180_000; // site-info can be long; bound it generously
const STORE_TIMEOUT_MS = 10_000;
const PREWARM_DEBOUNCE_MS = 5_000;

// Ephemeral scheduling state (NOT a data cache — these are timers/flags). A
// content write handler is the only writer; worst case a second module instance
// double-fires an idempotent regen. Keyed by site so tenants never collide.
const inFlight = new Set<string>(); // `${siteId}:${key}` currently generating
const prewarmTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Generate one quick-action answer for a site and store it. Returns true on a
 * stored answer, false on ship-dark / unknown key / empty / any failure. Never
 * throws.
 */
export async function generateQuickAnswer(key: string, siteId: string): Promise<boolean> {
  const action = quickActionByKey(key);
  const token = serviceToken();
  if (!action || !token || !siteId) return false;

  const flightKey = `${siteId}:${key}`;
  if (inFlight.has(flightKey)) return false; // dedupe concurrent regens
  inFlight.add(flightKey);
  try {
    const base = selfBase();
    const site = encodeURIComponent(siteId);
    const chatRes = await fetch(`${base}/api/cms/chat?site=${site}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMS-Service-Token": token },
      body: JSON.stringify({ messages: [{ role: "user", content: action.prompt }] }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    if (!chatRes.ok) return false;
    const markdown = parseChatSseText(await chatRes.text());
    if (!markdown.trim()) return false;

    const storeRes = await fetch(`${base}/api/cms/chat/quick/${key}?site=${site}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CMS-Service-Token": token },
      body: JSON.stringify({ markdown }),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    return storeRes.ok;
  } catch {
    return false;
  } finally {
    inFlight.delete(flightKey);
  }
}

/**
 * A cold peek schedules a background regen so the next click is instant.
 * Fire-and-forget + deduped (generateQuickAnswer guards concurrent runs).
 */
export function scheduleLazyRegen(key: string, siteId: string): void {
  if (!serviceToken() || !quickActionByKey(key)) return;
  void generateQuickAnswer(key, siteId);
}

/** Regenerate every content-dependent entry for a site (post-invalidation). */
async function prewarmSite(siteId: string): Promise<void> {
  for (const action of QUICK_ACTIONS) {
    // Sequential on purpose: three concurrent agentic runs would hammer the
    // model for no user-visible gain (this is background).
    if (action.contentDependent) await generateQuickAnswer(action.key, siteId);
  }
}

/** Debounced background pre-warm of a site's content-dependent answers. */
export function scheduleSitePrewarm(siteId: string, delayMs = PREWARM_DEBOUNCE_MS): void {
  if (!serviceToken() || !siteId) return;
  const existing = prewarmTimers.get(siteId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    prewarmTimers.delete(siteId);
    void prewarmSite(siteId);
  }, delayMs);
  timer.unref?.();
  prewarmTimers.set(siteId, timer);
}

/**
 * Call after a content/schema/settings write (from inside the write request, so
 * cookies resolve the active site): drop the stale content-dependent entries
 * now, then schedule a debounced pre-warm. `capabilities` is preserved. Never
 * throws — the write must not fail because pre-warm couldn't run.
 */
export async function invalidateQuickCacheOnWrite(): Promise<void> {
  try {
    await invalidateContentQuick();
    const site = await getActiveSiteEntry().catch(() => null);
    if (site?.id) scheduleSitePrewarm(site.id);
  } catch {
    /* pre-warm is best-effort */
  }
}
