/**
 * F143 P3 — Content-addressable extra-deps store.
 *
 * Each unique dep-set (sorted, normalized) hashes to a deterministic
 * directory under `{dataDir}/build-deps/<hash>/`. Multiple sites that
 * declare the same deps share the same install — no duplicate work,
 * no per-site `node_modules`.
 *
 * `dataDir` is whatever cms-admin's `getAdminDataDir()` resolves to:
 *   - Production (Fly): `/data/cms-admin/build-deps/`
 *   - Local dev:        `~/.webhouse/cms-admin/build-deps/`
 *
 * Hash strategy: sha256 over the sorted, lowercased, comma-joined
 * spec list. `'three'` and `'three@latest'` hash to DIFFERENT dirs so
 * a manual version-bump always installs into a fresh dir (no cache
 * confusion). `'three@^0.158.0'` and `'three@^0.158.0'` hash equal
 * regardless of declaration order.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { isProvidedBuildDep } from "./provided-deps";

/**
 * Normalise + sort a deps list for hashing. We deduplicate, lowercase
 * the package name (NOT the version range, which is case-sensitive for
 * git refs etc.), drop deps that cms-admin already provides via its
 * core pulje, and sort lexically. Returns a stable key the rest of the
 * system uses for hashing and pnpm install.
 */
export function normalizeDeps(deps: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of deps) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Strip a leading `@` from scope to compare with provided-deps'
    // canonical names (which include the leading `@`). Then split on
    // the FIRST `@` after position 0 to find the version separator.
    const atIdx = trimmed.indexOf("@", 1);
    const name = atIdx > 0 ? trimmed.slice(0, atIdx) : trimmed;
    // Skip if cms-admin already provides this package — installing it
    // again would bloat the deps store and shadow the pinned core dep.
    if (isProvidedBuildDep(name)) continue;
    // Normalise the package-name portion's case (npm names are
    // case-insensitive but conventionally lowercase). Leave the
    // version range unchanged.
    const versionPart = atIdx > 0 ? trimmed.slice(atIdx) : "";
    const normalized = name.toLowerCase() + versionPart;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.sort();
}

/**
 * Compute a deterministic sha256 hash for a normalized dep-set.
 * Empty deps return a special sentinel so callers can short-circuit
 * (no install needed = no NODE_PATH augmentation).
 */
export function hashDeps(deps: readonly string[]): string {
  const normalized = normalizeDeps(deps);
  if (normalized.length === 0) return "";
  return createHash("sha256").update(normalized.join(",")).digest("hex").slice(0, 16);
}

/**
 * Resolve the absolute path to a deps-set's install directory.
 * Returns null for the empty-deps case so callers can skip ahead.
 */
export function resolveDepsStoreDir(dataDir: string, hash: string): string | null {
  if (!hash) return null;
  return path.join(dataDir, "build-deps", hash);
}

/**
 * Resolve the node_modules path INSIDE a deps-set dir, suitable for
 * appending to NODE_PATH. Null if the deps-set is empty.
 */
export function resolveDepsNodeModulesPath(dataDir: string, hash: string): string | null {
  const dir = resolveDepsStoreDir(dataDir, hash);
  if (!dir) return null;
  return path.join(dir, "node_modules");
}

/**
 * Has a given deps-set already been installed? Cheap existsSync check
 * on the store dir's package.json (written by pnpm install).
 */
export function isDepsSetInstalled(dataDir: string, hash: string): boolean {
  const dir = resolveDepsStoreDir(dataDir, hash);
  if (!dir) return true; // empty deps = "always installed"
  return existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "node_modules"));
}

/**
 * Make sure the deps-store root exists. Idempotent. Creates `{dataDir}/build-deps/`.
 * Individual <hash>/ subdirs are created by the installer when it runs.
 */
export function ensureDepsStoreRoot(dataDir: string): string {
  const root = path.join(dataDir, "build-deps");
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}
