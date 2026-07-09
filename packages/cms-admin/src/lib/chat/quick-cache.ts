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
}
type CacheFile = Record<string, CacheEntry>;

// Content-dependent answers go stale after this; `capabilities` never expires on
// content (only a deploy changes the tool list). Kept short enough that a demo
// site edited an hour ago doesn't show a stale overview.
const TTL_MS = 30 * 60 * 1000; // 30 min

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
}

/** Fast, non-blocking read: the fresh cached answer for `key`, or {cached:false}.
 *  Returns null for an unknown key. */
export async function peekQuick(key: string): Promise<QuickResult> {
  const action = quickActionByKey(key);
  if (!action) return { cached: false, markdown: "", cachedAt: 0 };
  const cache = await readCache();
  const hit = cache[key];
  if (hit && isFresh(hit, action.contentDependent)) {
    return { cached: true, markdown: hit.markdown, cachedAt: hit.cachedAt };
  }
  return { cached: false, markdown: "", cachedAt: 0 };
}

/** Warm the cache with a finished answer (the client stores its streamed result
 *  after a cold miss). No-op for an unknown key or empty markdown. */
export async function storeQuick(key: string, markdown: string): Promise<void> {
  if (!quickActionByKey(key) || !markdown.trim()) return;
  const cache = await readCache();
  cache[key] = { markdown, cachedAt: Date.now() };
  await writeCache(cache).catch(() => {});
}

/** Drop content-dependent entries after a content/schema/settings write (F158.2
 *  wires the call sites). `capabilities` is preserved. */
export async function invalidateContentQuick(): Promise<void> {
  const cache = await readCache();
  let changed = false;
  for (const key of Object.keys(cache)) {
    const action = quickActionByKey(key);
    if (action?.contentDependent) { delete cache[key]; changed = true; }
  }
  if (changed) await writeCache(cache).catch(() => {});
}
