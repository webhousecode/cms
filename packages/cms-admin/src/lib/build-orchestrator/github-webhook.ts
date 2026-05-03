/**
 * F144 P8 — GitHub webhook helpers (signature + payload parse + site
 * lookup). Pure functions so the route handler stays thin and tests
 * don't need HTTP mocks.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadRegistry } from "../site-registry";
import type { SiteEntry } from "../site-registry";

export interface VerifySignatureResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify GitHub's `X-Hub-Signature-256` header against the raw body
 * using the shared webhook secret. Constant-time comparison.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifySignatureResult {
  if (!signatureHeader) return { valid: false, reason: "missing_signature" };
  if (!signatureHeader.startsWith("sha256=")) return { valid: false, reason: "bad_format" };
  if (!secret) return { valid: false, reason: "no_secret_configured" };

  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (provided.length !== expected.length) return { valid: false, reason: "bad_length" };
  const ok = timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  return ok ? { valid: true } : { valid: false, reason: "bad_signature" };
}

export interface ParsedPushEvent {
  /** "owner/repo" form. */
  repoFullName: string;
  /** Ref pushed to, e.g. "refs/heads/main". */
  ref: string;
  /** Branch name extracted from ref (or null if not a heads ref). */
  branch: string | null;
  /** SHA after the push — the new HEAD on that ref. */
  sha: string;
  /** Default branch reported by GitHub. */
  defaultBranch: string | null;
}

/**
 * Parse a GitHub `push` event payload. Returns null when fields
 * required for site lookup are missing — caller should 400 in that
 * case.
 */
export function parsePushEvent(payload: unknown): ParsedPushEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const repo = p.repository as Record<string, unknown> | undefined;
  const repoFullName = typeof repo?.full_name === "string" ? repo.full_name : null;
  const ref = typeof p.ref === "string" ? p.ref : null;
  const sha = typeof p.after === "string" ? p.after : null;
  const defaultBranch = typeof repo?.default_branch === "string" ? (repo.default_branch as string) : null;
  if (!repoFullName || !ref || !sha) return null;
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;
  return { repoFullName, ref, branch, sha, defaultBranch };
}

export interface MatchedSite {
  orgId: string;
  siteId: string;
  siteEntry: SiteEntry;
}

/**
 * Find site(s) backed by a given `owner/repo`. We match against
 * configPath which for github sites is `github://owner/repo/...`.
 *
 * Returns ALL matches (one repo can host many sites if they live in
 * different sub-paths), so the caller can fire one build per site.
 */
export async function findSitesByGitHubRepo(repoFullName: string): Promise<MatchedSite[]> {
  const registry = await loadRegistry();
  if (!registry) return [];
  const matches: MatchedSite[] = [];
  const prefix = `github://${repoFullName.toLowerCase()}/`;
  for (const org of registry.orgs) {
    for (const site of org.sites ?? []) {
      if (typeof site.configPath !== "string") continue;
      if (site.configPath.toLowerCase().startsWith(prefix)) {
        matches.push({ orgId: org.id, siteId: site.id, siteEntry: site });
      }
    }
  }
  return matches;
}
