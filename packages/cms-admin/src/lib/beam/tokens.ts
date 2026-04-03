/**
 * F122 — Beam Token Management.
 *
 * Single-use, time-limited tokens for authenticating Live Beam transfers.
 * Tokens are stored in _data/beam-tokens.json on the TARGET instance.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getActiveSitePaths } from "../site-paths";

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

/**
 * Generate a new beam token. Returns the full token string.
 * Token format: beam_ + 64 hex characters (32 bytes).
 */
export async function generateBeamToken(label?: string): Promise<BeamToken> {
  const { dataDir } = await getActiveSitePaths();
  const token: BeamToken = {
    token: TOKEN_PREFIX + randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString(),
    used: false,
    label,
  };

  const tokens = loadTokens(dataDir);
  // Prune expired/used tokens
  const now = Date.now();
  const active = tokens.filter(
    (t) => !t.used && new Date(t.expiresAt).getTime() > now,
  );
  active.push(token);
  saveTokens(dataDir, active);

  return token;
}

/**
 * Validate a beam token. If valid, marks it as used (single-use).
 * Returns the token record if valid, null if invalid/expired/used.
 */
export async function validateAndConsumeBeamToken(
  tokenValue: string,
  dataDir: string,
): Promise<BeamToken | null> {
  const tokens = loadTokens(dataDir);
  const now = Date.now();

  const idx = tokens.findIndex(
    (t) =>
      t.token === tokenValue &&
      !t.used &&
      new Date(t.expiresAt).getTime() > now,
  );

  if (idx === -1) return null;

  // Mark as used (single-use)
  tokens[idx].used = true;
  saveTokens(dataDir, tokens);

  return tokens[idx];
}

/**
 * List active (non-expired, non-used) beam tokens.
 */
export async function listActiveBeamTokens(): Promise<BeamToken[]> {
  const { dataDir } = await getActiveSitePaths();
  const tokens = loadTokens(dataDir);
  const now = Date.now();
  return tokens.filter(
    (t) => !t.used && new Date(t.expiresAt).getTime() > now,
  );
}
