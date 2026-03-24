/**
 * F87 — Org-Level Global Settings
 *
 * Shared settings inherited by all sites in an organization.
 * Inheritance chain: site-config → org-settings → env vars → defaults
 */
import fs from "fs/promises";
import path from "path";
import { cookies } from "next/headers";

// ── Types ────────────────────────────────────────────────────

export interface OrgSettings {
  // Deploy credentials
  deployApiToken?: string;
  deployFlyOrg?: string;
  deployHookUrl?: string;

  // Email
  resendApiKey?: string;
  emailFrom?: string;
  emailFromName?: string;

  // AI
  aiInteractivesModel?: string;
  aiInteractivesMaxTokens?: number;
  aiContentModel?: string;
  aiContentMaxTokens?: number;

  // MCP Servers (shared across all sites)
  mcpServers?: { name: string; command: string; args?: string[]; env?: Record<string, string> }[];

  // Default Webhooks
  defaultWebhooks?: { id: string; url: string }[];
}

// ── Field classification ─────────────────────────────────────

/** Fields that CAN be inherited from org → site */
export const INHERITABLE_FIELDS = [
  "deployApiToken",
  "deployFlyOrg",
  "deployHookUrl",
  "resendApiKey",
  "emailFrom",
  "emailFromName",
  "aiInteractivesModel",
  "aiInteractivesMaxTokens",
  "aiContentModel",
  "aiContentMaxTokens",
] as const;

/** Fields that must NEVER be inherited from org */
export const NEVER_INHERIT = [
  "calendarSecret",
  "deployAppName",
  "deployProductionUrl",
  "deployCustomDomain",
  "deployProvider",
  "deployOnSave",
  "previewSiteUrl",
] as const;

// ── Pure merge function ──────────────────────────────────────

/**
 * Merge configs with inheritance chain: defaults ← org ← site
 *
 * Rules:
 * 1. Site values override org values override defaults
 * 2. Empty strings ("") in site config do NOT override org values for inheritable fields
 * 3. NEVER_INHERIT fields are excluded from org settings
 * 4. Array fields: site replaces org (no merge)
 */
export function mergeConfigs(
  defaults: Record<string, unknown>,
  orgSettings: Record<string, unknown>,
  siteConfig: Record<string, unknown>,
): Record<string, unknown> {
  // Step 1: Filter org settings — exclude NEVER_INHERIT, skip empty values
  const filteredOrg: Record<string, unknown> = {};
  for (const key of Object.keys(orgSettings)) {
    if ((NEVER_INHERIT as readonly string[]).includes(key)) continue;
    const value = orgSettings[key];
    if (value !== undefined && value !== null && value !== "") {
      filteredOrg[key] = value;
    }
  }

  // Step 2: Filter site config — empty strings don't override for inheritable fields
  const filteredSite: Record<string, unknown> = {};
  for (const key of Object.keys(siteConfig)) {
    const value = siteConfig[key];
    if (value === "" && (INHERITABLE_FIELDS as readonly string[]).includes(key)) continue;
    if (value !== undefined && value !== null) {
      filteredSite[key] = value;
    }
  }

  // Step 3: Merge in order
  return { ...defaults, ...filteredOrg, ...filteredSite };
}

// ── Org resolution ───────────────────────────────────────────

/** Get the active org ID from cookie or registry default */
export async function getActiveOrgId(): Promise<string | null> {
  try {
    const { loadRegistry } = await import("./site-registry");
    const registry = await loadRegistry();
    if (!registry) return null;

    try {
      const cookieStore = await cookies();
      return cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
    } catch {
      return registry.defaultOrgId;
    }
  } catch {
    return null;
  }
}

// ── File persistence ─────────────────────────────────────────

/** Path to org settings file */
async function orgSettingsPath(orgId: string): Promise<string> {
  const { getAdminDataDir } = await import("./site-registry");
  const adminDir = getAdminDataDir();
  return path.join(adminDir, "_data", "org-settings", `${orgId}.json`);
}

/** Read org settings for a specific org */
export async function readOrgSettingsForOrg(orgId: string): Promise<Partial<OrgSettings>> {
  try {
    const filePath = await orgSettingsPath(orgId);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Partial<OrgSettings>;
  } catch {
    return {};
  }
}

/** Read org settings for the active org (from cookie) */
export async function readOrgSettings(): Promise<Partial<OrgSettings>> {
  const orgId = await getActiveOrgId();
  if (!orgId) return {};
  return readOrgSettingsForOrg(orgId);
}

/** Write/patch org settings for a specific org */
export async function writeOrgSettings(orgId: string, patch: Partial<OrgSettings>): Promise<Partial<OrgSettings>> {
  const filePath = await orgSettingsPath(orgId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let existing: Partial<OrgSettings> = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch { /* first write */ }

  const next = { ...existing, ...patch };
  await fs.writeFile(filePath, JSON.stringify(next, null, 2));
  return next;
}

// ── Migration helper ─────────────────────────────────────────

/**
 * Detect fields that have the same value across all sites in an org.
 * These can be safely migrated to org-level settings.
 */
export function detectMigratableFields(
  siteConfigs: Record<string, unknown>[],
): Record<string, unknown> {
  if (siteConfigs.length === 0) return {};

  const result: Record<string, unknown> = {};
  for (const field of INHERITABLE_FIELDS) {
    const values = siteConfigs
      .map((c) => c[field])
      .filter((v) => v !== undefined && v !== null && v !== "");

    if (values.length === 0) continue;

    const first = JSON.stringify(values[0]);
    const allSame = values.every((v) => JSON.stringify(v) === first);
    if (allSame) {
      result[field] = values[0];
    }
  }
  return result;
}
