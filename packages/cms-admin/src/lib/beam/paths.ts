/**
 * F122 — Beam path utilities.
 *
 * Provides a deterministic base directory for imported beam sites.
 * Works in both authenticated (session) and unauthenticated (beam token) contexts.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Returns the base directory for beam-imported sites.
 * Creates the directory if it doesn't exist.
 *
 * Uses CMS_CONFIG_PATH to derive the project directory — this works
 * in both authenticated and unauthenticated contexts (beam receive endpoints).
 */
export async function getBeamSitesDir(): Promise<string> {
  // Derive from CMS_CONFIG_PATH (always available)
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    const projectDir = path.dirname(path.resolve(configPath));
    const dir = path.join(projectDir, ".beam-sites");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // Fallback: use CWD
  const dir = path.join(process.cwd(), ".beam-sites");
  mkdirSync(dir, { recursive: true });
  return dir;
}
