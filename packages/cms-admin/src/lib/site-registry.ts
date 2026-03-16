/**
 * Site Registry — manages orgs and sites for multi-site admin.
 *
 * When `_admin/registry.json` exists → multi-site mode.
 * When it doesn't → single-site mode (CMS_CONFIG_PATH env var).
 */
import fs from "node:fs/promises";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────

export interface SiteGitHub {
  owner: string;
  repo: string;
  branch?: string;
  contentDir?: string;
  token: string; // raw value or "env:VAR_NAME"
}

export interface SiteEntry {
  id: string;
  name: string;
  adapter: "filesystem" | "github";
  configPath: string;       // absolute path or "github://owner/repo/path"
  contentDir?: string;      // absolute path (filesystem only)
  uploadDir?: string;       // absolute path (filesystem only)
  previewUrl?: string;
  github?: SiteGitHub;      // github adapter only
  revalidateUrl?: string;   // e.g. "https://example.com/api/revalidate"
  revalidateSecret?: string; // HMAC-SHA256 signing secret
}

export interface OrgEntry {
  id: string;
  name: string;
  sites: SiteEntry[];
}

export interface Registry {
  orgs: OrgEntry[];
  defaultOrgId: string;
  defaultSiteId: string;
}

// ─── Paths ────────────────────────────────────────────────

function getAdminDataDir(): string {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (configPath) {
    return path.join(path.dirname(path.resolve(configPath)), "_admin");
  }
  // Fallback: use home dir
  return path.join(process.env.HOME ?? "/tmp", ".webhouse-cms");
}

function getRegistryPath(): string {
  return path.join(getAdminDataDir(), "registry.json");
}

// ─── Load / Save ──────────────────────────────────────────

let _cached: Registry | null = null;

export async function loadRegistry(): Promise<Registry | null> {
  if (_cached && process.env.NODE_ENV === "production") return _cached;

  const registryPath = getRegistryPath();
  try {
    const raw = await fs.readFile(registryPath, "utf-8");
    _cached = JSON.parse(raw) as Registry;
    return _cached;
  } catch {
    return null; // No registry → single-site mode
  }
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const registryPath = getRegistryPath();
  const dir = path.dirname(registryPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
  _cached = registry;
}

// ─── Queries ──────────────────────────────────────────────

export function findSite(registry: Registry, orgId: string, siteId: string): SiteEntry | null {
  const org = registry.orgs.find((o) => o.id === orgId);
  if (!org) return null;
  return org.sites.find((s) => s.id === siteId) ?? null;
}

export function findOrg(registry: Registry, orgId: string): OrgEntry | null {
  return registry.orgs.find((o) => o.id === orgId) ?? null;
}

export function getDefaultSite(registry: Registry): { org: OrgEntry; site: SiteEntry } | null {
  const org = findOrg(registry, registry.defaultOrgId);
  if (!org) return null;
  const site = org.sites.find((s) => s.id === registry.defaultSiteId) ?? org.sites[0];
  if (!site) return null;
  return { org, site };
}

// ─── Mutations ────────────────────────────────────────────

export async function addOrg(name: string): Promise<OrgEntry> {
  const registry = await loadRegistry() ?? { orgs: [], defaultOrgId: "", defaultSiteId: "" };
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const org: OrgEntry = { id, name, sites: [] };
  registry.orgs.push(org);
  if (!registry.defaultOrgId) registry.defaultOrgId = id;
  await saveRegistry(registry);
  return org;
}

export async function addSite(orgId: string, site: SiteEntry): Promise<void> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No registry");
  const org = findOrg(registry, orgId);
  if (!org) throw new Error(`Org "${orgId}" not found`);
  org.sites.push(site);
  if (!registry.defaultSiteId) registry.defaultSiteId = site.id;
  await saveRegistry(registry);
}

export async function removeSite(orgId: string, siteId: string): Promise<void> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No registry");
  const org = findOrg(registry, orgId);
  if (!org) throw new Error(`Org "${orgId}" not found`);
  org.sites = org.sites.filter((s) => s.id !== siteId);
  await saveRegistry(registry);
}

export async function removeOrg(orgId: string): Promise<void> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No registry");
  registry.orgs = registry.orgs.filter((o) => o.id !== orgId);
  await saveRegistry(registry);
}

// ─── Bootstrap ────────────────────────────────────────────

/**
 * If CMS_CONFIG_PATH is set but no registry exists, create a default
 * single-org registry with the current site. This is the migration path
 * from single-site to multi-site.
 */
export async function bootstrapRegistryFromEnv(): Promise<Registry> {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");

  const absoluteConfig = path.resolve(configPath);
  const projectDir = path.dirname(absoluteConfig);
  const projectName = path.basename(projectDir);

  const site: SiteEntry = {
    id: projectName,
    name: projectName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    adapter: "filesystem",
    configPath: absoluteConfig,
    contentDir: path.join(projectDir, "content"),
    uploadDir: process.env.UPLOAD_DIR ?? path.join(projectDir, "public", "uploads"),
    previewUrl: process.env.NEXT_PUBLIC_PREVIEW_SITE_URL,
  };

  const org: OrgEntry = {
    id: "default",
    name: "Default",
    sites: [site],
  };

  const registry: Registry = {
    orgs: [org],
    defaultOrgId: "default",
    defaultSiteId: site.id,
  };

  await saveRegistry(registry);
  return registry;
}

// ─── Mode Detection ───────────────────────────────────────

export type AdminMode = "single-site" | "multi-site";

export async function getAdminMode(): Promise<AdminMode> {
  const registry = await loadRegistry();
  return registry ? "multi-site" : "single-site";
}
