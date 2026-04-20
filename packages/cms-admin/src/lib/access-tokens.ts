/**
 * API Access Tokens — F134 Cloudflare-style permission model.
 *
 * Tokens authorise (permission P, resource R, client IP I) requests against
 * a list of allow/exclude filters. A token can say "deploy:trigger on site
 * fysiodk only from IP 1.2.3.4" instead of F128's flat "admin | deploy |
 * content:read" scopes.
 *
 * Storage: hashed (SHA-256) in `_data/access-tokens.json` under the admin
 * data dir (never inside a specific site). Raw token shown once at creation.
 *
 * Format: `wh_<32 random hex>`; displayPrefix = first 10 chars for grep-
 * friendly listing without leaking the secret.
 */
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

// ─── Types ────────────────────────────────────────────────────────

/** Cloudflare-style permission. Flattened from their 3-dropdown cascade
 * (scope → category → action) into `"<area>:<action>"` strings. */
export type Permission =
  // content
  | "content:read" | "content:write" | "content:publish"
  // media
  | "media:read" | "media:write" | "media:delete"
  // deploy
  | "deploy:trigger" | "deploy:read"
  // forms
  | "forms:read" | "forms:write"
  // admin surfaces (org-level, no per-site narrowing)
  | "team:manage" | "tokens:manage" | "sites:read" | "sites:write"
  | "org:settings:read" | "org:settings:write"
  // meta
  | "*";

export const ALL_PERMISSIONS: Permission[] = [
  "content:read", "content:write", "content:publish",
  "media:read", "media:write", "media:delete",
  "deploy:trigger", "deploy:read",
  "forms:read", "forms:write",
  "team:manage", "tokens:manage", "sites:read", "sites:write",
  "org:settings:read", "org:settings:write",
];

export type ResourceScope = "org" | "site" | "admin-area";
export type ResourceEffect = "include" | "exclude";

export interface ResourceFilter {
  scope: ResourceScope;
  effect: ResourceEffect;
  /** "*" = every target in this scope; otherwise concrete ids. */
  targets: "*" | string[];
}

export type IpFilterOp = "in" | "not_in";
export interface IpFilter {
  op: IpFilterOp;
  cidrs: string[];
}

/** Runtime resource the caller is reaching for. Examples:
 *   `org:settings`, `site:trail`, `admin:deploy`, `admin:tokens`. */
export type Resource =
  | "org:*"
  | "org:settings"
  | "site:*"
  | `site:${string}`
  | `admin:${string}`;

/** Legacy F128 scope — kept only to parse old stored tokens. */
export type TokenScope = "admin" | "content:read" | "content:write" | "deploy" | "media";

export interface StoredToken {
  id: string;
  name: string;
  /** Free-form description: where this token is deployed, who owns it,
   * why it was created. Helps operators locate a token months later. */
  description?: string;
  hash: string;
  userId: string;
  createdAt: string;
  lastUsed?: string;

  /** First 14 chars of the raw token (`wh_<first 11 hex>`). 44 bits of
   * entropy exposed — enough to grep in env files / shell history and
   * locate a specific token unambiguously — with 212 bits of SHA-256
   * preimage resistance remaining in the 53 unexposed hex nybbles.
   * `null` for tokens minted before F134 (can't recover raw from hash). */
  displayPrefix: string | null;

  permissions: Permission[];
  resources: ResourceFilter[];
  ipFilters: IpFilter[];

  notBefore?: string;
  notAfter?: string;

  /** Legacy — only present on pre-F134 tokens. New writes never include it. */
  scopes?: TokenScope[];
}

interface TokenStore {
  tokens: StoredToken[];
}

// ─── Paths ────────────────────────────────────────────────────────

function getStorePath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAdminDataDir } = require("./site-registry") as typeof import("./site-registry");
  return path.join(getAdminDataDir(), "_data", "access-tokens.json");
}

async function loadStore(): Promise<TokenStore> {
  try {
    const raw = await fs.readFile(getStorePath(), "utf-8");
    const parsed = JSON.parse(raw) as TokenStore;
    // Synthesize F134 fields for legacy tokens that only have `scopes[]`.
    for (const t of parsed.tokens) {
      if (!t.permissions) synthesizeFromLegacy(t);
    }
    return parsed;
  } catch {
    return { tokens: [] };
  }
}

async function saveStore(store: TokenStore): Promise<void> {
  const filePath = getStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
}

// ─── Legacy scopes → F134 rules shim ──────────────────────────────

/** Convert a pre-F134 token's `scopes[]` into the new fields in place. */
function synthesizeFromLegacy(t: StoredToken): void {
  const scopes = (t.scopes ?? []) as TokenScope[];
  const has = (s: TokenScope) => scopes.includes(s);
  const perms = new Set<Permission>();

  if (has("admin")) {
    for (const p of ALL_PERMISSIONS) perms.add(p);
  } else {
    if (has("content:read")) { perms.add("content:read"); perms.add("content:publish"); }
    if (has("content:write")) { perms.add("content:read"); perms.add("content:write"); perms.add("content:publish"); }
    if (has("deploy")) { perms.add("deploy:trigger"); perms.add("deploy:read"); }
    if (has("media")) { perms.add("media:read"); perms.add("media:write"); perms.add("media:delete"); }
  }

  t.permissions = Array.from(perms);
  t.resources = t.resources ?? [];
  t.ipFilters = t.ipFilters ?? [];
  t.displayPrefix = t.displayPrefix ?? null;
}

// ─── Hash ─────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ─── IP matching ──────────────────────────────────────────────────

/** Check if an IPv4 address is in a CIDR (or equal to a bare IP).
 * IPv6 support can be added later — today's deploy clients are IPv4. */
function ipInCidr(ip: string, cidr: string): boolean {
  if (!ip) return false;
  if (!cidr.includes("/")) return ip === cidr;
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const toInt = (s: string) => {
    const parts = s.split(".");
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
      const octet = parseInt(p, 10);
      if (isNaN(octet) || octet < 0 || octet > 255) return null;
      n = (n << 8) | octet;
    }
    return n >>> 0;
  };
  const ipN = toInt(ip); const baseN = toInt(base);
  if (ipN === null || baseN === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

// ─── Resource matching ────────────────────────────────────────────

function resourceMatchesFilter(resource: Resource, f: ResourceFilter): boolean {
  const [scopeTag, rest] = resource.split(":");
  // Map request scope tag to filter scope
  const requestScope: ResourceScope =
    scopeTag === "admin" ? "admin-area" :
    scopeTag === "site"  ? "site" :
    "org";
  if (f.scope !== requestScope) return false;
  if (f.targets === "*") return true;
  if (!rest) return false;
  // Wildcard request "site:*" only matches "*" filter, which was handled above.
  if (rest === "*") return false;
  return f.targets.includes(rest);
}

// ─── Evaluation ───────────────────────────────────────────────────

export interface EvaluateResult {
  allow: boolean;
  reason?: string;
}

export function evaluateToken(
  token: StoredToken,
  permission: Permission,
  resource: Resource,
  clientIp: string,
  now: Date = new Date(),
): EvaluateResult {
  // 1. TTL window
  if (token.notBefore && now < new Date(token.notBefore)) {
    return { allow: false, reason: "token not yet valid" };
  }
  if (token.notAfter && now >= new Date(token.notAfter)) {
    return { allow: false, reason: "token expired" };
  }

  // 2. IP filters
  const notIns = token.ipFilters.filter((f) => f.op === "not_in");
  for (const f of notIns) {
    if (f.cidrs.some((c) => ipInCidr(clientIp, c))) {
      return { allow: false, reason: "client ip on denylist" };
    }
  }
  const ins = token.ipFilters.filter((f) => f.op === "in");
  if (ins.length > 0) {
    const ok = ins.some((f) => f.cidrs.some((c) => ipInCidr(clientIp, c)));
    if (!ok) return { allow: false, reason: "client ip not on allowlist" };
  }

  // 3. Permission
  const perms = token.permissions ?? [];
  if (!perms.includes("*") && !perms.includes(permission)) {
    return { allow: false, reason: `missing permission ${permission}` };
  }

  // 4. Resource filters
  const filters = token.resources ?? [];
  if (filters.length === 0) return { allow: true };

  const includes = filters.filter((f) => f.effect === "include");
  const excludes = filters.filter((f) => f.effect === "exclude");

  // If no include filters: default is "all resources in org". Then apply excludes.
  // If include filters: caller must match at least one include.
  if (includes.length > 0) {
    const included = includes.some((f) => resourceMatchesFilter(resource, f));
    if (!included) return { allow: false, reason: "resource not in include set" };
  }
  for (const f of excludes) {
    if (resourceMatchesFilter(resource, f)) {
      return { allow: false, reason: "resource in exclude set" };
    }
  }
  return { allow: true };
}

// ─── CRUD ─────────────────────────────────────────────────────────

export interface CreateTokenInput {
  name: string;
  description?: string;
  userId: string;
  permissions?: Permission[];
  resources?: ResourceFilter[];
  ipFilters?: IpFilter[];
  notBefore?: string;
  notAfter?: string;
  /** Legacy — converted to permissions/resources/ipFilters if present. */
  scopes?: TokenScope[];
}

/** Create a new access token. Returns the raw token (shown once). */
export async function createAccessToken(
  input: CreateTokenInput,
): Promise<{ token: string; stored: StoredToken }> {
  const raw = `wh_${crypto.randomBytes(32).toString("hex")}`;
  const displayPrefix = raw.slice(0, 14); // "wh_" + 11 hex → 44 bits visible

  let { permissions = [], resources = [], ipFilters = [] } = input;
  if (input.scopes && input.scopes.length && permissions.length === 0) {
    const synth = { scopes: input.scopes } as StoredToken;
    synthesizeFromLegacy(synth);
    permissions = synth.permissions;
    resources = synth.resources;
    ipFilters = synth.ipFilters;
  }

  const stored: StoredToken = {
    id: crypto.randomBytes(8).toString("hex"),
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    hash: hashToken(raw),
    userId: input.userId,
    createdAt: new Date().toISOString(),
    displayPrefix,
    permissions,
    resources,
    ipFilters,
    ...(input.notBefore ? { notBefore: input.notBefore } : {}),
    ...(input.notAfter ? { notAfter: input.notAfter } : {}),
  };

  const store = await loadStore();
  store.tokens.push(stored);
  await saveStore(store);
  return { token: raw, stored };
}

/** Verify a raw token. Returns the stored entry if the hash matches, null otherwise. */
export async function verifyAccessToken(raw: string): Promise<StoredToken | null> {
  if (!raw.startsWith("wh_")) return null;
  const hash = hashToken(raw);
  const store = await loadStore();
  const match = store.tokens.find((t) => t.hash === hash);
  if (match) {
    match.lastUsed = new Date().toISOString();
    saveStore(store).catch(() => {});
  }
  return match ?? null;
}

/** Legacy helper — still used by some call sites pending F134 migration.
 * Maps the old `TokenScope` to the equivalent F134 permission check. */
export function hasScope(token: StoredToken, scope: TokenScope): boolean {
  const perms = token.permissions ?? [];
  if (perms.includes("*")) return true;
  if (scope === "admin") return perms.length === ALL_PERMISSIONS.length;
  if (scope === "deploy") return perms.includes("deploy:trigger") || perms.includes("deploy:read");
  if (scope === "media") return perms.includes("media:read") || perms.includes("media:write") || perms.includes("media:delete");
  return perms.includes(scope as Permission);
}

/** List all tokens for a user (stored metadata only, never the raw token). */
export async function listTokens(userId: string): Promise<StoredToken[]> {
  const store = await loadStore();
  return store.tokens.filter((t) => t.userId === userId);
}

/** Revoke (delete) a token by id. Returns true if it existed. */
export async function revokeToken(tokenId: string, userId: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.tokens.findIndex((t) => t.id === tokenId && t.userId === userId);
  if (idx < 0) return false;
  store.tokens.splice(idx, 1);
  await saveStore(store);
  return true;
}
