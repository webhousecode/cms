import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getActiveSitePaths } from "./site-paths";

export interface McpApiKey {
  key: string;
  label: string;
  scopes: string[];
}

export interface McpConfig {
  keys: McpApiKey[];
}

export interface McpApiKeyMasked {
  id: string;        // first 8 chars — used as stable UI key
  label: string;
  scopes: string[];
  masked: string;    // e.g. "abc12345…ef12"
}

export interface McpConfigMasked {
  keys: McpApiKeyMasked[];
}

async function getConfigPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "mcp-config.json");
}

export async function readMcpConfig(): Promise<McpConfig> {
  const filePath = await getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as McpConfig;
  } catch {
    return { keys: [] };
  }
}

export async function writeMcpConfig(config: McpConfig): Promise<void> {
  const filePath = await getConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

function maskKey(key: string): string {
  if (key.length < 12) return key;
  return key.slice(0, 8) + "…" + key.slice(-4);
}

export function maskMcpConfig(config: McpConfig): McpConfigMasked {
  return {
    keys: config.keys.map((k) => ({
      id: k.key.slice(0, 8),
      label: k.label,
      scopes: k.scopes,
      masked: maskKey(k.key),
    })),
  };
}

/** Returns all key configs — for use by the MCP admin route */
export async function getMcpApiKeys(): Promise<McpApiKey[]> {
  // 1. Try _data/mcp-config.json
  try {
    const config = await readMcpConfig();
    if (config.keys.length > 0) return config.keys;
  } catch {
    // fall through
  }

  // 2. Fall back to env vars (MCP_API_KEY_1..5 or MCP_API_KEY)
  const keys: McpApiKey[] = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`MCP_API_KEY_${i}`];
    const label = process.env[`MCP_API_KEY_${i}_LABEL`] ?? `Key ${i}`;
    const scopes = (process.env[`MCP_API_KEY_${i}_SCOPES`] ?? "read,write,publish,deploy,ai")
      .split(",")
      .map((s) => s.trim());
    if (key) keys.push({ key, label, scopes });
  }
  const single = process.env.MCP_API_KEY;
  if (single && keys.length === 0) {
    keys.push({ key: single, label: "Default", scopes: ["read", "write", "publish", "deploy", "ai"] });
  }
  return keys;
}

// ── Site-scoped key resolution ─────────────────────────────────

export interface ResolvedMcpKey {
  orgId: string;
  siteId: string;
  label: string;
  scopes: string[];
}

/**
 * Resolve an API key to a specific org+site by scanning ALL sites' mcp-config.json.
 *
 * This is the ONLY safe way to authenticate MCP requests from external clients
 * (Claude Desktop, Cursor, etc.) that don't send cookies. The API key uniquely
 * identifies a site — no cookie fallback, no default site ambiguity.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function resolveApiKeyToSite(bearerHeader: string | null): Promise<ResolvedMcpKey | null> {
  if (!bearerHeader?.startsWith("Bearer ")) return null;
  const token = bearerHeader.slice(7).trim();
  if (!token) return null;

  // F134: accept `wh_...` access tokens. Map their permissions to legacy
  // MCP scope strings ("read"/"write"/"publish"/"deploy"/"ai"/"admin") so
  // existing TOOL_SCOPES checks keep working. Resource filters narrow the
  // token to a specific site — we pick the first allowed site here. Tokens
  // with no site restriction (empty resources or "site:*") bind to the
  // default org+site.
  if (token.startsWith("wh_")) {
    const { verifyAccessToken } = await import("./access-tokens");
    const stored = await verifyAccessToken(token);
    if (stored) {
      const scopes = permissionsToMcpScopes(stored.permissions ?? []);
      const { orgId, siteId } = await resolveBoundSite(stored.resources ?? []);
      return { orgId, siteId, label: stored.name, scopes };
    }
    // Looked like wh_ but didn't verify — fall through (caller returns 401)
  }

  const tokenBuf = Buffer.from(token);

  // Try multi-site mode first (registry with orgs → sites)
  try {
    const { loadRegistry } = await import("./site-registry");
    const { getSitePathsFor } = await import("./site-paths");
    const registry = await loadRegistry();

    if (registry) {
      for (const org of registry.orgs) {
        for (const site of org.sites) {
          const paths = await getSitePathsFor(org.id, site.id);
          if (!paths) continue;

          const configPath = path.join(paths.dataDir, "mcp-config.json");
          try {
            const raw = await fs.readFile(configPath, "utf-8");
            const config = JSON.parse(raw) as McpConfig;
            for (const key of config.keys) {
              const keyBuf = Buffer.from(key.key);
              if (keyBuf.length === tokenBuf.length && crypto.timingSafeEqual(keyBuf, tokenBuf)) {
                return { orgId: org.id, siteId: site.id, label: key.label, scopes: key.scopes };
              }
            }
          } catch {
            // No mcp-config.json for this site — skip
          }
        }
      }
      return null; // Key not found in any site
    }
  } catch {
    // No registry — single-site mode
  }

  // Single-site mode: validate against active site keys
  const keys = await getMcpApiKeys();
  for (const key of keys) {
    const keyBuf = Buffer.from(key.key);
    if (keyBuf.length === tokenBuf.length && crypto.timingSafeEqual(keyBuf, tokenBuf)) {
      return { orgId: "default", siteId: "default", label: key.label, scopes: key.scopes };
    }
  }

  return null;
}

// ─── F134 → MCP bridge ──────────────────────────────────────────

/** Map an F134 Permission list to the legacy MCP scope vocabulary
 * (`read` / `write` / `publish` / `deploy` / `ai` / `admin`) so the
 * MCP server's existing TOOL_SCOPES checks keep working unchanged. */
function permissionsToMcpScopes(perms: readonly string[]): string[] {
  const out = new Set<string>();
  if (perms.includes("*")) {
    out.add("admin"); out.add("read"); out.add("write");
    out.add("publish"); out.add("deploy"); out.add("ai");
    return Array.from(out);
  }
  for (const p of perms) {
    if (p.endsWith(":read")) out.add("read");
    if (p === "content:write" || p === "media:write" || p === "forms:write") out.add("write");
    if (p === "content:publish") { out.add("publish"); out.add("write"); }
    if (p === "deploy:trigger") { out.add("deploy"); out.add("write"); }
    if (p === "media:delete" || p === "content:publish") out.add("write");
    if (p === "team:manage" || p === "tokens:manage" || p === "sites:write" || p === "org:settings:write") {
      out.add("admin"); out.add("write");
    }
  }
  // "ai" permission doesn't map directly in F134 — tools tagged "ai" also
  // require "write" which the mapping above produces from content:write.
  // Grant "ai" when content:write is present so AI tools remain usable.
  if (out.has("write")) out.add("ai");
  return Array.from(out);
}

/** Derive the (orgId, siteId) that a token's resource filters bind to.
 * If the filters name a specific site, use the first one. Otherwise the
 * token is org-wide — fall back to the default. */
async function resolveBoundSite(
  filters: ReadonlyArray<{ scope: string; effect: string; targets: "*" | string[] }>,
): Promise<{ orgId: string; siteId: string }> {
  const includes = filters.filter((f) => f.effect === "include" && f.scope === "site");
  for (const f of includes) {
    if (Array.isArray(f.targets) && f.targets.length > 0) {
      const siteId = f.targets[0];
      const { loadRegistry } = await import("./site-registry");
      const registry = await loadRegistry();
      if (registry) {
        for (const org of registry.orgs) {
          if (org.sites.some((s) => s.id === siteId)) {
            return { orgId: org.id, siteId };
          }
        }
      }
    }
  }
  // Org-wide or no registry — use default binding
  const { loadRegistry } = await import("./site-registry");
  const registry = await loadRegistry();
  if (registry) {
    return { orgId: registry.defaultOrgId, siteId: registry.defaultSiteId };
  }
  return { orgId: "default", siteId: "default" };
}
