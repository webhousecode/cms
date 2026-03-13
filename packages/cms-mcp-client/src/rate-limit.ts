interface Counter {
  count: number;
  exportAllCount: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const MAX_EXPORT_ALL = 5;

function getCounter(ip: string): Counter {
  const now = Date.now();
  let c = counters.get(ip);
  if (!c || now > c.resetAt) {
    c = { count: 0, exportAllCount: 0, resetAt: now + WINDOW_MS };
    counters.set(ip, c);
  }
  return c;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function checkRateLimit(ip: string, tool?: string): RateLimitResult {
  const c = getCounter(ip);

  if (tool === "export_all") {
    if (c.exportAllCount >= MAX_EXPORT_ALL) {
      return { allowed: false, reason: "export_all rate limit exceeded (5/minute)" };
    }
    c.exportAllCount++;
  }

  if (c.count >= MAX_REQUESTS) {
    return { allowed: false, reason: "Rate limit exceeded (60 requests/minute)" };
  }

  c.count++;
  return { allowed: true };
}
