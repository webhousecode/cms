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
