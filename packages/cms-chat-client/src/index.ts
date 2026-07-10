/**
 * @broberg/cms-chat-client — quick-action cache client (F158).
 *
 * The chat's standard quick-actions (site overview / drafts / site-info /
 * "what can you do") are cached per-site by the CMS (F158 engine in cms-admin)
 * and served in ms. This is the ONE client the three consumers call so the
 * peek→instant-render + warm-after-stream logic isn't hand-rolled three times:
 *   - cms-admin's own welcome screen (same-origin, cookie session),
 *   - broberg.ai (its /api/admin/chat relay), and
 *   - sanneandersen (its proxy / a Bearer token).
 *
 * Each consumer differs only in the URL + auth, so both calls take a small
 * options bag. Zero dependencies, framework-agnostic (works in React, Preact,
 * or vanilla). Neither call ever throws: a miss / network error resolves to a
 * "not cached" result so the caller always falls back to normal streaming.
 *
 * This package is the seed of the full @webhouse/cms chat client; it grows from
 * here and pairs with @broberg/cms-chat-server.
 */

/** The cacheable quick-actions. Kept in sync with the server's quick-actions.ts. */
export type QuickActionKey = "overview" | "drafts" | "site-info" | "capabilities";

export const QUICK_ACTION_KEYS: readonly QuickActionKey[] = [
  "overview",
  "drafts",
  "site-info",
  "capabilities",
] as const;

export interface QuickActionResult {
  cached: boolean;
  markdown: string;
  cachedAt: number;
}

export interface QuickActionOptions {
  /**
   * Base URL of the endpoint host. "" (default) = same-origin (cms-admin's own
   * UI, or a site's same-origin relay). "https://webhouse.app" for a direct
   * cross-origin call (e.g. sanne with a token).
   */
  baseUrl?: string;
  /**
   * Path template; ":key" is replaced with the action key. Default
   * "/api/cms/chat/quick/:key". A relay overrides it, e.g.
   * "/api/admin/chat/quick/:key" (broberg).
   */
  path?: string;
  /** Site id sent as ?site=. Omit for a cookie session that already resolves the site. */
  siteId?: string;
  /** Extra headers, e.g. { Authorization: "Bearer <token>" }. Same-origin cookie callers need none. */
  headers?: Record<string, string>;
  /** Inject fetch (tests / non-browser). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_PATH = "/api/cms/chat/quick/:key";
const NOT_CACHED: QuickActionResult = { cached: false, markdown: "", cachedAt: 0 };

function buildUrl(key: string, opts: QuickActionOptions): string {
  const base = opts.baseUrl ?? "";
  const path = (opts.path ?? DEFAULT_PATH).replace(":key", encodeURIComponent(key));
  const query = opts.siteId ? `?site=${encodeURIComponent(opts.siteId)}` : "";
  return `${base}${path}${query}`;
}

/**
 * Read the cached answer for a quick-action. A warm hit returns
 * `{ cached: true, markdown }` for instant render; anything else (cold, unknown
 * key, non-OK, network error) returns `{ cached: false }` so the caller streams
 * as normal. Never throws.
 */
export async function peekQuickAction(
  key: QuickActionKey | string,
  opts: QuickActionOptions = {},
): Promise<QuickActionResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(buildUrl(key, opts), {
      method: "GET",
      ...(opts.headers ? { headers: opts.headers } : {}),
    });
    if (!res.ok) return NOT_CACHED;
    const data = (await res.json()) as Partial<QuickActionResult>;
    return {
      cached: data.cached === true,
      markdown: typeof data.markdown === "string" ? data.markdown : "",
      cachedAt: typeof data.cachedAt === "number" ? data.cachedAt : 0,
    };
  } catch {
    return NOT_CACHED;
  }
}

/**
 * Warm the cache with a finished answer after a cold stream. No-op for empty
 * markdown. Returns whether the store succeeded. Never throws. (cms-admin can
 * skip this — its server lazy-regenerates on a cold peek; broberg warms after
 * streaming.)
 */
export async function warmQuickAction(
  key: QuickActionKey | string,
  markdown: string,
  opts: QuickActionOptions = {},
): Promise<boolean> {
  if (!markdown.trim()) return false;
  const fetchFn = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(buildUrl(key, opts), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
      body: JSON.stringify({ markdown }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
