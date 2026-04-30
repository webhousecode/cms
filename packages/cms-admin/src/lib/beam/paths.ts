/**
 * F122 — Beam path utilities.
 *
 * Provides a deterministic base directory for imported beam sites.
 * Works in both authenticated (session) and unauthenticated (beam token) contexts.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Base directory for beam-imported sites (staging area for cross-site beam
 * transfers). Admin-server-level — lives alongside the registry, not inside
 * any specific site, so transfers survive site moves/deletions.
 */
export async function getBeamSitesDir(): Promise<string> {
  const { getAdminDataDir } = await import("../site-registry");
  const dir = path.join(getAdminDataDir(), "beam-sites");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Volume-backed temp dir for chunked Beam Import uploads. Lives on the
 * persistent volume (not os.tmpdir() / RAM disk) so partially-uploaded
 * chunks survive machine restarts and don't pollute the in-RAM /tmp.
 *
 * Layout: <getAdminDataDir>/_data/beam-tmp/<uploadId>/chunk-NNNNNN.bin
 */
export async function getBeamTmpDir(): Promise<string> {
  const { getAdminDataDir } = await import("../site-registry");
  const dir = path.join(getAdminDataDir(), "_data", "beam-tmp");
  mkdirSync(dir, { recursive: true });
  return dir;
}
