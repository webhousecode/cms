/**
 * Server-side CMS instance for the admin UI.
 *
 * Two modes:
 * - Single-site: CMS_CONFIG_PATH env var, no registry (backwards compatible)
 * - Multi-site:  _admin/registry.json with orgs + sites, cookie-based switching
 */
import { createCms } from "@webhouse/cms";
import type { CmsConfig } from "@webhouse/cms";
import { dirname, resolve } from "node:path";
import { cookies } from "next/headers";
import { loadRegistry, findSite, getDefaultSite } from "./site-registry";
import { getOrCreateInstance } from "./site-pool";

// ─── Single-site mode cache ──────────────────────────────

let _singleCms: Awaited<ReturnType<typeof createCms>> | null = null;
let _singleConfig: CmsConfig | null = null;

async function getSingleSiteCms() {
  if (_singleCms && process.env.NODE_ENV === "production") {
    return { cms: _singleCms, config: _singleConfig! };
  }

  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) {
    throw new Error(
      "CMS_CONFIG_PATH environment variable is not set. " +
      "Point it to your cms.config.ts (or .js) file."
    );
  }

  const absoluteConfigPath = resolve(configPath);
  const projectDir = dirname(absoluteConfigPath);
  process.chdir(projectDir);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(absoluteConfigPath, { debug: false, moduleCache: false });
  const mod = await jiti.import(absoluteConfigPath) as { default?: CmsConfig } | CmsConfig;
  _singleConfig = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;
  _singleCms = await createCms(_singleConfig);
  return { cms: _singleCms, config: _singleConfig };
}

// ─── Public API ──────────────────────────────────────────

export async function getAdminCms() {
  const registry = await loadRegistry();

  if (!registry) {
    // Single-site mode — exactly as before
    const { cms } = await getSingleSiteCms();
    return cms;
  }

  // Multi-site mode — read active org+site from cookies
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const activeSiteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;

  const site = findSite(registry, activeOrgId, activeSiteId);
  if (!site) {
    // Fallback to default
    const def = getDefaultSite(registry);
    if (!def) throw new Error("No sites configured in registry");
    const instance = await getOrCreateInstance(def.org.id, def.site);
    return instance.cms;
  }

  const instance = await getOrCreateInstance(activeOrgId, site);
  return instance.cms;
}

export async function getAdminConfig(): Promise<CmsConfig> {
  const registry = await loadRegistry();

  if (!registry) {
    const { config } = await getSingleSiteCms();
    return config;
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const activeSiteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;

  const site = findSite(registry, activeOrgId, activeSiteId);
  if (!site) {
    const def = getDefaultSite(registry);
    if (!def) throw new Error("No sites configured in registry");
    const instance = await getOrCreateInstance(def.org.id, def.site);
    return instance.config;
  }

  const instance = await getOrCreateInstance(activeOrgId, site);
  return instance.config;
}

/**
 * Get info about the currently active site (for UI display).
 * Returns null in single-site mode.
 */
export async function getActiveSiteInfo() {
  const registry = await loadRegistry();
  if (!registry) return null;

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const activeSiteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;

  const org = registry.orgs.find((o) => o.id === activeOrgId);
  const site = org?.sites.find((s) => s.id === activeSiteId);

  return {
    registry,
    activeOrgId,
    activeSiteId,
    orgName: org?.name ?? activeOrgId,
    siteName: site?.name ?? activeSiteId,
  };
}
