/**
 * Security W41 H7 — login, mobile login, TOTP verify and invitation accept had
 * no attempt limit: unlimited password/code guessing, and every attempt costs
 * a bcrypt-12 hash (CPU exhaustion). One fixed-window limiter per client IP
 * and door. In-memory is enough: webhouse.app runs one machine, and a
 * restart only resets the window (it never opens a door).
 */
const WINDOW_MS = 10 * 60 * 1000;
export const AUTH_ATTEMPTS_PER_WINDOW = 10;

const hits = new Map<string, { count: number; resetAt: number }>();

/** Records one attempt; true when the caller is over the limit. */
export function authAttemptLimited(door: string, ip: string | null, now = Date.now()): boolean {
  const key = `${door}:${ip ?? "unknown"}`;
  const cur = hits.get(key);
  if (!cur || cur.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return false;
  }
  cur.count += 1;
  return cur.count > AUTH_ATTEMPTS_PER_WINDOW;
}

export function clientIp(headers: Headers): string | null {
  return headers.get("fly-client-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export const TOO_MANY_ATTEMPTS = { error: "Too many attempts — wait a few minutes and try again" } as const;

/** Test-only. */
export function _resetAuthRateLimit(): void { hits.clear(); }
