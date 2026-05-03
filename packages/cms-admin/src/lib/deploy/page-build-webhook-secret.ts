/**
 * Per-site secret used to verify GitHub `page_build` webhook payloads.
 *
 * GitHub signs each delivery with HMAC-SHA256 using a secret we register
 * when adding the webhook to the repo. We persist that secret per-site
 * under `_data/page-build-webhook-secret.json` so the receiver can verify
 * later deliveries.
 *
 * One secret per site (not per repo) because the same repo could host
 * multiple sites in different sub-paths and each needs its own verification
 * path.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";

const FILE_NAME = "page-build-webhook-secret.json";

interface SecretFile {
  secret: string;
  createdAt: string;
  /** GitHub hook id (after registration), so we can update / delete later. */
  hookId?: number;
  /** Repo we registered against, for change detection. */
  repo?: string;
}

async function secretPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, FILE_NAME);
}

function readFile(file: string): SecretFile | null {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf-8")) as SecretFile; }
  catch { return null; }
}

function writeFile(file: string, data: SecretFile): void {
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  // Secret material — restrict to owner-read-only.
  try { chmodSync(file, 0o600); } catch { /* fs perms not critical */ }
}

/**
 * Get the per-site webhook secret, generating a new one if none exists.
 * Idempotent: returns the same secret on every call until explicitly
 * rotated.
 */
export async function getOrCreatePageBuildSecret(): Promise<{ secret: string; hookId?: number; repo?: string }> {
  const file = await secretPath();
  const existing = readFile(file);
  if (existing?.secret) return existing;
  const secret = randomBytes(32).toString("hex");
  const fresh: SecretFile = { secret, createdAt: new Date().toISOString() };
  writeFile(file, fresh);
  return fresh;
}

/** Read just the secret. Returns null if not yet registered. */
export async function getPageBuildSecret(): Promise<string | null> {
  const file = await secretPath();
  return readFile(file)?.secret ?? null;
}

/** Persist the GitHub hook id + repo after successful registration. */
export async function recordHookRegistration(opts: { hookId: number; repo: string }): Promise<void> {
  const file = await secretPath();
  const cur = readFile(file);
  if (!cur) throw new Error("Cannot record hook before secret exists");
  writeFile(file, { ...cur, hookId: opts.hookId, repo: opts.repo });
}

/**
 * Cross-site lookup: find which site owns a given secret. Used by the
 * webhook receiver — GitHub's payload doesn't tell us which CMS site it
 * belongs to, so we read repo.full_name from the payload and match
 * against the per-site stored repo. (HMAC + repo match = the right site.)
 *
 * Walks all org+site dataDirs. Limit to ~200 sites — beyond that, switch
 * to a registry-side index.
 */
import { loadRegistry } from "../site-registry";
import { withSiteContext } from "../site-context";

export interface SecretMatch {
  orgId: string;
  siteId: string;
  secret: string;
}

export async function findSiteSecretsByRepo(repoFullName: string): Promise<SecretMatch[]> {
  const registry = await loadRegistry();
  if (!registry) return [];
  const matches: SecretMatch[] = [];
  for (const org of registry.orgs) {
    for (const site of org.sites ?? []) {
      try {
        const stored = await withSiteContext({ orgId: org.id, siteId: site.id }, async () => {
          const file = await secretPath();
          return readFile(file);
        });
        if (stored?.secret && stored.repo?.toLowerCase() === repoFullName.toLowerCase()) {
          matches.push({ orgId: org.id, siteId: site.id, secret: stored.secret });
        }
      } catch { /* skip sites that fail to resolve */ }
    }
  }
  return matches;
}
