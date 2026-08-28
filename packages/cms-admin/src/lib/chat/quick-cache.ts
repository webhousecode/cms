/**
 * Per-site cache of quick-action answers (F158).
 *
 * The chat's standard quick-actions take 30-60s to generate through the agentic
 * loop. We cache the finished markdown per (site, key) so a click is instant.
 *
 * v1 model: peek + store with a TTL. A warm cache is served instantly (peek); a
 * miss streams as today and the client stores the finished markdown back
 * (store), so the NEXT click is instant. A TTL bounds staleness. F158.2 adds
 * precise write-hook invalidation + server-side eager pre-warm so even the
 * first click is instant.
 *
 * Store: {dataDir}/chat-quick-cache.json (next to chat-conversations/chat-memory).
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";
import { quickActionByKey } from "@/lib/chat/quick-actions";

interface CacheEntry {
  markdown: string;
  cachedAt: number;
  /** Set by a content write. The answer is no longer trusted as current, but it
   *  is still the best thing we have until the regen lands — see peekQuick. */
  stale?: boolean;
}
type CacheFile = Record<string, CacheEntry>;

// Content-dependent answers go stale after this; `capabilities` never expires on
// content (only a deploy changes the tool list). Kept short enough that a demo
// site edited an hour ago doesn't show a stale overview.
const TTL_MS = 30 * 60 * 1000; // 30 min

/**
 * How old an answer may be and still be shown while a fresh one generates.
 *
 * Christian, 28 Aug 2026, choosing this trade deliberately: «ja, vis det gamle
 * svar med det samme». The alternative he lived with was a 55-second wait on
 * his largest site every time he had edited anything — because a content write
 * DELETED the entry, so there was nothing left to fall back on.
 *
 * The bound matters. Serving a four-minute-old overview while the new one
 * arrives is a good trade; serving last week's is not — it stops being "not
 * quite current" and becomes wrong. Past this, we wait for the real answer.
 */
const MAX_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function cacheFilePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "chat-quick-cache.json");
}

async function readCache(): Promise<CacheFile> {
  try {
    const raw = await fs.readFile(await cacheFilePath(), "utf-8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return {};
  }
}

async function writeCache(cache: CacheFile): Promise<void> {
  const file = await cacheFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(cache), "utf-8");
}

function isFresh(entry: CacheEntry, contentDependent: boolean): boolean {
  if (!contentDependent) return true; // capabilities: any age is fine
  return Date.now() - entry.cachedAt < TTL_MS;
}

export interface QuickResult {
  cached: boolean;
  markdown: string;
  cachedAt: number;
  /** True when `markdown` is a previous answer being shown while a fresh one
   *  generates. The caller does not have to act on it — the note is already in
   *  the markdown — but a consumer that wants to badge it can. */
  stale?: boolean;
}

/** Minutes/hours since `t`, in Danish, for the staleness note. */
function ageLabel(t: number): string {
  const min = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h === 1 ? "1 time" : `${h} timer`;
}

/**
 * Fast, non-blocking read: the cached answer for `key`.
 *
 * A FRESH hit is returned as-is. A STALE hit — an answer invalidated by a
 * content write, or past the TTL — is still returned, with a one-line note
 * saying how old it is, so the click is instant instead of a 55-second wait
 * while the same answer sits unused on disk. The caller schedules the regen.
 *
 * The note is not decoration: without it, someone who has just edited content
 * sees old numbers and reasonably concludes the CMS did not register the edit.
 * That misreading is worse than the slowness this replaces, so the answer must
 * say what it is. Written in Danish because every site on this deployment is
 * Danish-primary; if that stops being true, this line needs the site's locale.
 */
export async function peekQuick(key: string): Promise<QuickResult> {
  const action = quickActionByKey(key);
  if (!action) return { cached: false, markdown: "", cachedAt: 0 };
  const cache = await readCache();
  const hit = cache[key];
  if (!hit || !hit.markdown) return { cached: false, markdown: "", cachedAt: 0 };

  if (isFresh(hit, action.contentDependent) && !hit.stale) {
    return { cached: true, markdown: hit.markdown, cachedAt: hit.cachedAt };
  }

  // Too old to stand in for the real answer — wait for the regen instead.
  if (Date.now() - hit.cachedAt > MAX_STALE_MS) {
    return { cached: false, markdown: "", cachedAt: 0 };
  }

  const note = `\n\n---\n_Vist fra hukommelsen (${ageLabel(hit.cachedAt)} gammel). Et opdateret svar hentes nu._`;
  return { cached: true, stale: true, markdown: hit.markdown + note, cachedAt: hit.cachedAt };
}

/** Warm the cache with a finished answer (the client stores its streamed result
 *  after a cold miss). No-op for an unknown key or empty markdown. */
export async function storeQuick(key: string, markdown: string): Promise<void> {
  if (!quickActionByKey(key) || !markdown.trim()) return;
  const cache = await readCache();
  // A fresh answer clears the stale flag — `stale` is deliberately absent
  // rather than false, so a re-read cannot inherit it.
  cache[key] = { markdown, cachedAt: Date.now() };
  await writeCache(cache).catch(() => {});
}

/**
 * Mark content-dependent entries stale after a content/schema/settings write.
 *
 * It used to DELETE them, and that is what made the wait unavoidable: the answer
 * was thrown away, so the next click had nothing to show and paid the full
 * generation — 55 seconds on the largest site, after every single edit. Marking
 * instead of deleting costs nothing and is the whole reason peekQuick has
 * something to serve.
 *
 * `capabilities` is untouched: only a deploy changes the tool list.
 */
export async function invalidateContentQuick(): Promise<void> {
  const cache = await readCache();
  let changed = false;
  for (const key of Object.keys(cache)) {
    const action = quickActionByKey(key);
    if (action?.contentDependent && !cache[key].stale) {
      cache[key] = { ...cache[key], stale: true };
      changed = true;
    }
  }
  if (changed) await writeCache(cache).catch(() => {});
}
