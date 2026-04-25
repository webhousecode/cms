/**
 * F122 — Beam Token Management.
 *
 * Single-use, time-limited tokens for authenticating Live Beam transfers.
 *
 * F138-C: Tokens are now stored at the admin-server level
 * (`<adminDataDir>/beam-tokens.json`). The receive flow validates
 * against this admin-level path. A site-level fallback path is read
 * for backwards compatibility so existing tokens generated before
 * F138 keep working through the transition.
 *
 * Why admin-level: a Beam token says "this CMS instance will receive
 * ONE site within the next hour". That's an instance-level capability,
 * not site-level. Storing per-site made it impossible to receive a
 * site on a fresh empty CMS (no active site = no place to put tokens).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";
import { getAdminDataDir } from "../site-registry";

export interface BeamToken {
  /** The token value (beam_ + 64 hex chars) */
  token: string;
  /** ISO timestamp when token was created */
  createdAt: string;
  /** ISO timestamp when token expires */
  expiresAt: string;
  /** Whether the token has been used */
  used: boolean;
  /** Optional label for the token */
  label?: string;
}

const TOKEN_PREFIX = "beam_";
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function getTokensPath(dataDir: string): string {
  return path.join(dataDir, "beam-tokens.json");
}

function loadTokens(dataDir: string): BeamToken[] {
  const filePath = getTokensPath(dataDir);
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function saveTokens(dataDir: string, tokens: BeamToken[]): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(getTokensPath(dataDir), JSON.stringify(tokens, null, 2));
}

/** Admin-level beam-tokens.json path (F138-C canonical). */
function adminTokensDir(): string {
  return getAdminDataDir();
}

/** Site-level beam-tokens.json path for backwards-compat reads. May throw if no active site. */
async function legacySiteTokensDir(): Promise<string | null> {
  try {
    const { dataDir } = await getActiveSitePaths();
    return dataDir;
  } catch {
    return null;
  }
}

/**
 * Generate a new beam token. Returns the full token string.
 * Token format: beam_ + 64 hex characters (32 bytes).
 *
 * F138-C: writes to admin-level path so empty CMS can generate tokens.
 */
export async function generateBeamToken(label?: string): Promise<BeamToken> {
  const dir = adminTokensDir();
  const token: BeamToken = {
    token: TOKEN_PREFIX + randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString(),
    used: false,
    label,
  };

  const tokens = loadTokens(dir);
  // Prune expired/used tokens
  const now = Date.now();
  const active = tokens.filter(
    (t) => !t.used && new Date(t.expiresAt).getTime() > now,
  );
  active.push(token);
  saveTokens(dir, active);

  return token;
}

/**
 * Validate a beam token. If valid, marks it as used (single-use).
 * Returns the token record if valid, null if invalid/expired/used.
 *
 * F138-C: checks admin-level path first, then falls back to the
 * caller-provided dataDir (typically site-level) for backwards compat.
 * The marking-used write goes back to whichever path the token was
 * found in.
 */
export async function validateAndConsumeBeamToken(
  tokenValue: string,
  legacyDataDir: string,
): Promise<BeamToken | null> {
  const now = Date.now();

  // Try admin-level first.
  const adminDir = adminTokensDir();
  const adminTokens = loadTokens(adminDir);
  const adminIdx = adminTokens.findIndex(
    (t) => t.token === tokenValue && !t.used && new Date(t.expiresAt).getTime() > now,
  );
  if (adminIdx !== -1) {
    adminTokens[adminIdx].used = true;
    saveTokens(adminDir, adminTokens);
    return adminTokens[adminIdx];
  }

  // Fall back to legacy site-level path.
  const legacyTokens = loadTokens(legacyDataDir);
  const legacyIdx = legacyTokens.findIndex(
    (t) => t.token === tokenValue && !t.used && new Date(t.expiresAt).getTime() > now,
  );
  if (legacyIdx === -1) return null;

  legacyTokens[legacyIdx].used = true;
  saveTokens(legacyDataDir, legacyTokens);
  return legacyTokens[legacyIdx];
}

/**
 * List active (non-expired, non-used) beam tokens. Merges admin-level
 * and (if available) legacy site-level paths so existing tokens stay
 * visible during the transition.
 */
export async function listActiveBeamTokens(): Promise<BeamToken[]> {
  const now = Date.now();
  const adminTokens = loadTokens(adminTokensDir())
    .filter((t) => !t.used && new Date(t.expiresAt).getTime() > now);

  const siteDir = await legacySiteTokensDir();
  if (!siteDir) return adminTokens;

  const siteTokens = loadTokens(siteDir)
    .filter((t) => !t.used && new Date(t.expiresAt).getTime() > now);

  // De-dupe in case the same token somehow landed in both places.
  const seen = new Set(adminTokens.map((t) => t.token));
  return [...adminTokens, ...siteTokens.filter((t) => !seen.has(t.token))];
}
