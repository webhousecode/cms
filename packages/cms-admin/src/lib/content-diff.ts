/**
 * Content drift detector — compares cms-admin's source-of-truth content
 * tree against a live site's `/api/admin/content-tree` endpoint.
 *
 * Why: even though ICD reliably propagates new edits live, drift can
 * still creep in over time (e.g. a collection added to baked-content/
 * but later removed from cms.config.ts; or a one-off manual write to
 * the live volume that never round-tripped through the CMS). Drift is
 * benign individually but corrosive if undetected — this module
 * surfaces it so an operator can decide to add the collection to
 * cms.config.ts or clean it up on the live volume.
 *
 * Read-only: this module never WRITES anywhere. The fix is a human
 * decision: add to cms.config.ts vs. delete on live.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getActiveSitePaths, getActiveSiteEntry } from "./site-paths";

export interface ContentEntry {
  collection: string;
  slug: string;
  size?: number;
  mtime?: string;
}

export interface ContentTree {
  tree: ContentEntry[];
  total: number;
  generatedAt: string;
}

export interface ContentDiff {
  /** Entries present in cms-admin but missing on live. */
  onlyInCms: ContentEntry[];
  /** Entries present on live but missing in cms-admin (suspect orphans). */
  onlyInLive: ContentEntry[];
  /** Entries on both sides. */
  inBoth: number;
  /** Collections cms-admin has but live doesn't. */
  collectionsOnlyInCms: string[];
  /** Collections live has but cms-admin doesn't (the drift case). */
  collectionsOnlyInLive: string[];
  /** Total counts on each side. */
  cmsTotal: number;
  liveTotal: number;
  /** Timestamp of the diff. */
  generatedAt: string;
}

// ─── Local (cms-admin) tree ────────────────────────────────

/**
 * Walk the active site's content directory and build a flat tree of
 * `{ collection, slug, size, mtime }` entries. Skips internal files
 * (anything starting with `_` or `.`) so the diff matches what live's
 * /api/admin/content-tree exposes.
 */
export async function getCmsAdminContentTree(): Promise<ContentTree> {
  const { contentDir } = await getActiveSitePaths();
  const entries: ContentEntry[] = [];

  let collections: string[] = [];
  try {
    const dir = await fs.readdir(contentDir, { withFileTypes: true });
    collections = dir
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    // contentDir doesn't exist — empty tree
    return {
      tree: [],
      total: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  for (const collection of collections) {
    const colDir = path.join(contentDir, collection);
    let files: string[] = [];
    try {
      files = (await fs.readdir(colDir, { withFileTypes: true }))
        .filter((d) => d.isFile() && d.name.endsWith(".json") && !d.name.startsWith(".") && !d.name.startsWith("_"))
        .map((d) => d.name);
    } catch { /* skip unreadable */ }

    for (const file of files) {
      const filePath = path.join(colDir, file);
      let size: number | undefined;
      let mtime: string | undefined;
      try {
        const stat = await fs.stat(filePath);
        size = stat.size;
        mtime = stat.mtime.toISOString();
      } catch { /* skip unreadable */ }
      entries.push({
        collection,
        slug: file.replace(/\.json$/, ""),
        ...(size !== undefined && { size }),
        ...(mtime && { mtime }),
      });
    }
  }

  return {
    tree: entries,
    total: entries.length,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Remote (live site) tree ────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

export interface FetchLiveTreeOptions {
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch the live site's content tree via its /api/admin/content-tree
 * endpoint. Uses the same `revalidateSecret` for HMAC auth so we don't
 * introduce a second secret to manage.
 *
 * The signature is computed over an empty body (the request has no
 * payload) — same algorithm as /api/revalidate so the live route can
 * reuse its existing HMAC verification helper.
 */
export async function fetchLiveContentTree(
  opts?: FetchLiveTreeOptions,
): Promise<ContentTree> {
  const site = await getActiveSiteEntry();
  if (!site) throw new Error("no active site for drift check");
  if (!site.revalidateUrl) {
    throw new Error("active site has no revalidateUrl — cannot derive content-tree URL");
  }
  if (!site.revalidateSecret) {
    throw new Error("active site has no revalidateSecret — cannot authenticate content-tree call");
  }

  // Convention: /api/admin/content-tree on the same origin as /api/revalidate.
  const url = site.revalidateUrl.replace(/\/api\/revalidate\/?$/, "/api/admin/content-tree");

  const body = ""; // GET with empty body — signature still required so opaque servers can't accept random GETs
  const signature = crypto
    .createHmac("sha256", site.revalidateSecret)
    .update(body)
    .digest("hex");

  const fetchFn = opts?.fetchImpl ?? fetch;
  const res = await fetchFn(url, {
    method: "GET",
    headers: {
      "X-CMS-Signature": `sha256=${signature}`,
      "X-CMS-Event": "content.tree",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`live content-tree returned HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = await res.json() as ContentTree;
  if (!Array.isArray(data.tree)) {
    throw new Error("live content-tree response missing 'tree' array");
  }
  return data;
}

// ─── Diff ──────────────────────────────────────────────────

function entryKey(e: ContentEntry): string {
  return `${e.collection}/${e.slug}`;
}

export function diffTrees(local: ContentTree, live: ContentTree): ContentDiff {
  const localKeys = new Map(local.tree.map((e) => [entryKey(e), e] as const));
  const liveKeys = new Map(live.tree.map((e) => [entryKey(e), e] as const));

  const onlyInCms: ContentEntry[] = [];
  const onlyInLive: ContentEntry[] = [];
  let inBoth = 0;

  for (const [k, e] of localKeys) {
    if (liveKeys.has(k)) inBoth++;
    else onlyInCms.push(e);
  }
  for (const [k, e] of liveKeys) {
    if (!localKeys.has(k)) onlyInLive.push(e);
  }

  const localCols = new Set(local.tree.map((e) => e.collection));
  const liveCols = new Set(live.tree.map((e) => e.collection));
  const collectionsOnlyInCms = [...localCols].filter((c) => !liveCols.has(c)).sort();
  const collectionsOnlyInLive = [...liveCols].filter((c) => !localCols.has(c)).sort();

  return {
    onlyInCms,
    onlyInLive,
    inBoth,
    collectionsOnlyInCms,
    collectionsOnlyInLive,
    cmsTotal: local.total,
    liveTotal: live.total,
    generatedAt: new Date().toISOString(),
  };
}

// ─── One-shot diff for active site ─────────────────────────

/**
 * Convenience wrapper: fetch local + remote trees in parallel and
 * return a diff. Throws if the live endpoint isn't reachable — the
 * caller should surface that as a "site offline" rather than a real
 * drift report.
 */
export async function diffActiveSiteContent(opts?: FetchLiveTreeOptions): Promise<ContentDiff> {
  const [local, live] = await Promise.all([
    getCmsAdminContentTree(),
    fetchLiveContentTree(opts),
  ]);
  return diffTrees(local, live);
}
