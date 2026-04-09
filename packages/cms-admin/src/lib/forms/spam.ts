/**
 * F30 — Spam protection for public form endpoints.
 *
 * Two layers:
 *   1. Honeypot — a hidden field bots fill but humans don't.
 *   2. IP rate limiter — in-memory Map with automatic TTL sweep.
 *
 * Optional third layer: Cloudflare Turnstile token validation.
 */

import crypto from "crypto";

const HONEYPOT_FIELD = "_hp_email";

/** Returns true if the honeypot field was filled (i.e. likely a bot). */
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  const val = body[HONEYPOT_FIELD];
  return val !== undefined && val !== "" && val !== null;
}

export { HONEYPOT_FIELD };

// ── IP Rate Limiter ──────────────────────────────────────────────

interface RateEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const store = new Map<string, RateEntry>();
let lastSweep = Date.now();

function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return; // sweep at most once per minute
  lastSweep = now;
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) store.delete(key);
  }
}

/**
 * Hash the IP to a short prefix so we can rate-limit without storing
 * raw IP addresses (GDPR-friendly). 8 hex chars = 32 bits of entropy,
 * plenty for a per-form hourly counter.
 */
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 8);
}

/**
 * Check if the given IP hash has exceeded the rate limit for this form.
 * Returns true if the request should be BLOCKED.
 */
export function isRateLimited(ipHash: string, formName: string, maxPerHour: number): boolean {
  sweep();
  const key = `${formName}:${ipHash}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  return entry.count > maxPerHour;
}

/** Test-only: reset rate limiter state. */
export function _resetRateLimiter() {
  store.clear();
}

// ── Turnstile (optional) ─────────────────────────────────────────

/**
 * Validate a Cloudflare Turnstile token. Returns true if valid.
 * Only called when TURNSTILE_SECRET_KEY is set.
 */
export async function validateTurnstile(token: string, secret: string): Promise<boolean> {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}
