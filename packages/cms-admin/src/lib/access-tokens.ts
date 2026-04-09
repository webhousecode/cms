/**
 * API Access Tokens — create, verify, revoke.
 *
 * Tokens are stored hashed (SHA-256) in _data/access-tokens.json.
 * The raw token is shown to the user ONCE at creation and never stored.
 *
 * Format: `wh_<32 random hex chars>` (e.g. wh_a1b2c3d4...)
 * The prefix makes tokens recognizable in logs and secret scanners.
 */
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

export type TokenScope = "admin" | "content:read" | "content:write" | "deploy" | "media";

export interface StoredToken {
  id: string;
  name: string;
  hash: string; // SHA-256 of the raw token
  scopes: TokenScope[];
  userId: string;
  createdAt: string;
  lastUsed?: string;
}

interface TokenStore {
  tokens: StoredToken[];
}

// ─── Paths ───────────────────────────────────────────

function getStorePath(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    return path.join(path.dirname(path.resolve(configPath)), "_data", "access-tokens.json");
  }
  return path.join(process.env.HOME ?? "/tmp", ".webhouse-cms", "access-tokens.json");
}

async function loadStore(): Promise<TokenStore> {
  try {
    const raw = await fs.readFile(getStorePath(), "utf-8");
    return JSON.parse(raw) as TokenStore;
  } catch {
    return { tokens: [] };
  }
}

async function saveStore(store: TokenStore): Promise<void> {
  const filePath = getStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
}

// ─── Hash ────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ─── API ─────────────────────────────────────────────

/** Create a new access token. Returns the raw token (shown once). */
export async function createAccessToken(
  name: string,
  scopes: TokenScope[],
  userId: string,
): Promise<{ token: string; stored: StoredToken }> {
  const raw = `wh_${crypto.randomBytes(32).toString("hex")}`;
  const stored: StoredToken = {
    id: crypto.randomBytes(8).toString("hex"),
    name,
    hash: hashToken(raw),
    scopes,
    userId,
    createdAt: new Date().toISOString(),
  };

  const store = await loadStore();
  store.tokens.push(stored);
  await saveStore(store);

  return { token: raw, stored };
}

/** Verify a raw token. Returns the stored entry if valid, null if not. */
export async function verifyAccessToken(raw: string): Promise<StoredToken | null> {
  if (!raw.startsWith("wh_")) return null;

  const hash = hashToken(raw);
  const store = await loadStore();
  const match = store.tokens.find((t) => t.hash === hash);

  if (match) {
    // Update lastUsed (fire-and-forget)
    match.lastUsed = new Date().toISOString();
    saveStore(store).catch(() => {});
  }

  return match ?? null;
}

/** Check if a token has a specific scope. `admin` scope grants everything. */
export function hasScope(token: StoredToken, scope: TokenScope): boolean {
  return token.scopes.includes("admin") || token.scopes.includes(scope);
}

/** List all tokens for a user (hashes only, never raw tokens). */
export async function listTokens(userId: string): Promise<StoredToken[]> {
  const store = await loadStore();
  return store.tokens.filter((t) => t.userId === userId);
}

/** Revoke (delete) a token by ID. */
export async function revokeToken(tokenId: string, userId: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.tokens.findIndex((t) => t.id === tokenId && t.userId === userId);
  if (idx < 0) return false;
  store.tokens.splice(idx, 1);
  await saveStore(store);
  return true;
}
