/**
 * F144 P6 — Rollback to a previous good image.
 *
 * Walks `_data/builds/<siteId>/*.json`, finds the most-recent build
 * with `final.success === true && final.imageTag`, and returns its
 * image tag. Caller then redeploys the Fly app pinned to that tag.
 *
 * Pure data lookup — does not actually trigger the Fly deploy. Wiring
 * to deploy-service lives in the route handler so this module stays
 * unit-testable without network.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { getActiveSitePaths } from "../site-paths";
import type { BuildRecord } from "./build-log";

export interface PreviousImage {
  sha: string;
  imageTag: string;
  startedAt: string;
  durationMs?: number;
}

export interface FindPreviousOptions {
  siteId: string;
  /** Exclude this sha when searching (e.g. the failed build itself). */
  excludeSha?: string;
  /** Look at most this many records back. Default 50. */
  scanLimit?: number;
}

/**
 * Find the most-recent successful build's image, optionally excluding
 * a specific sha (the one that just failed). Returns null if no prior
 * successful build is recorded.
 */
export async function findPreviousGoodImage(
  opts: FindPreviousOptions,
): Promise<PreviousImage | null> {
  const { siteId, excludeSha, scanLimit = 50 } = opts;
  const { dataDir } = await getActiveSitePaths();
  const dir = path.join(dataDir, "builds", siteId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  const records: BuildRecord[] = [];
  for (const f of files) {
    try {
      const raw = readFileSync(path.join(dir, f), "utf-8");
      records.push(JSON.parse(raw) as BuildRecord);
    } catch {
      // skip malformed
    }
  }
  records.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const scanned = records.slice(0, scanLimit);
  for (const rec of scanned) {
    if (excludeSha && rec.sha === excludeSha) continue;
    if (rec.final?.success && rec.final.imageTag) {
      return {
        sha: rec.sha,
        imageTag: rec.final.imageTag,
        startedAt: rec.startedAt,
        ...(rec.final.durationMs !== undefined && { durationMs: rec.final.durationMs }),
      };
    }
  }
  return null;
}
