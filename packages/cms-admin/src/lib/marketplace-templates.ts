/**
 * Agent template marketplace connector (Phase 6).
 *
 * Two-tier fetch with graceful degradation:
 *
 * 1. **Primary**: webhouse.app/api/agent-templates — the curated marketplace
 *    served by the webhouse-site project. Returns the full template list as
 *    JSON. Doesn't exist yet at the time of writing — when it lands the
 *    connector picks it up automatically.
 *
 * 2. **Fallback**: raw.githubusercontent.com/webhousecode/cms-agents/main/
 *    manifest.json — community-curated repo we maintain. The manifest lists
 *    template files; each is fetched on demand from the same repo.
 *
 * Result is cached in-process for `CACHE_TTL_MS` so the new-agent page
 *  doesn't refetch on every keypress. Cache is invalidated by passing
 *  `{ force: true }` to `fetchMarketplaceTemplates`.
 */
import type { AgentTemplate } from "./agent-templates";

const PRIMARY_URL = "https://webhouse.app/api/agent-templates";
const FALLBACK_MANIFEST_URL =
  "https://raw.githubusercontent.com/webhousecode/cms-agents/main/manifest.json";
const FALLBACK_TEMPLATE_BASE =
  "https://raw.githubusercontent.com/webhousecode/cms-agents/main/templates/";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  templates: AgentTemplate[];
  fetchedAt: number;
  source: "primary" | "fallback" | "empty";
}

let cache: CacheEntry | null = null;

interface FetchResult {
  templates: AgentTemplate[];
  source: "primary" | "fallback" | "empty";
  /** Set when both sources failed — UI should show a soft warning. */
  error?: string;
}

/**
 * Fetch the marketplace template list. Tries the primary endpoint first,
 * falls back to the GitHub manifest. Caches the result for 5 minutes.
 *
 * `fetchImpl` is injected for tests.
 */
export async function fetchMarketplaceTemplates(opts: {
  force?: boolean;
  fetchImpl?: typeof fetch;
} = {}): Promise<FetchResult> {
  const { force = false, fetchImpl = fetch } = opts;

  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { templates: cache.templates, source: cache.source };
  }

  // ── Try primary (webhouse.app) ──
  try {
    const res = await fetchImpl(PRIMARY_URL, {
      headers: { Accept: "application/json" },
      // Short timeout so a slow primary doesn't block the fallback
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { templates?: AgentTemplate[] } | AgentTemplate[];
      const templates = Array.isArray(data) ? data : (data.templates ?? []);
      const normalized = templates.map((t) => ({ ...t, source: "marketplace" as const }));
      cache = { templates: normalized, fetchedAt: Date.now(), source: "primary" };
      return { templates: normalized, source: "primary" };
    }
  } catch {
    // Primary unreachable / timeout — fall through to fallback
  }

  // ── Try fallback (GitHub raw) ──
  try {
    const manifestRes = await fetchImpl(FALLBACK_MANIFEST_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (manifestRes.ok) {
      const manifest = (await manifestRes.json()) as {
        templates?: { file: string; id?: string }[];
      };
      const entries = manifest.templates ?? [];
      const fetched: AgentTemplate[] = [];
      for (const entry of entries) {
        try {
          const tplRes = await fetchImpl(`${FALLBACK_TEMPLATE_BASE}${entry.file}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (!tplRes.ok) continue;
          const tpl = (await tplRes.json()) as AgentTemplate;
          fetched.push({ ...tpl, source: "marketplace" });
        } catch {
          // Skip individual template failures
        }
      }
      cache = { templates: fetched, fetchedAt: Date.now(), source: "fallback" };
      return { templates: fetched, source: "fallback" };
    }
  } catch {
    // Both sources down
  }

  // ── Both failed — return empty + cached error so UI can warn ──
  cache = { templates: [], fetchedAt: Date.now(), source: "empty" };
  return {
    templates: [],
    source: "empty",
    error: "Marketplace unreachable. Try again later or use a local template.",
  };
}

/** Force a fresh fetch on next call. */
export function clearMarketplaceCache(): void {
  cache = null;
}
