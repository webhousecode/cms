/**
 * Server-side CMS instance for the admin UI.
 *
 * Two modes:
 * - Single-site: CMS_CONFIG_PATH env var, no registry (backwards compatible)
 * - Multi-site:  _admin/registry.json with orgs + sites, cookie-based switching
 */
import { createCms } from "@webhouse/cms";
import type { CmsConfig } from "@webhouse/cms";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cookies } from "next/headers";
import { loadRegistry, findSite, findOrg, getDefaultSite } from "./site-registry";
import { getOrCreateInstance } from "./site-pool";

/** Same chdir-free path absolutization as in site-pool. See site-pool.ts for rationale. */
function absolutizeConfigPaths(config: CmsConfig, projectDir: string): void {
  const fs = (config.storage as { filesystem?: { contentDir?: string } } | undefined)?.filesystem;
  if (fs?.contentDir && !isAbsolute(fs.contentDir)) {
    fs.contentDir = join(projectDir, fs.contentDir);
  }
}

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

  const { createJiti } = await import("jiti");
  const jiti = createJiti(absoluteConfigPath, { debug: false, moduleCache: false });
  const mod = await jiti.import(absoluteConfigPath) as { default?: CmsConfig } | CmsConfig;
  _singleConfig = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;
  // Absolutize relative paths so we don't need a process.chdir() (which races
  // between concurrent requests in multi-site mode and is harmful here too).
  absolutizeConfigPaths(_singleConfig, projectDir);
  // strict: catch any future regression that lets a relative path through.
  _singleCms = await createCms(_singleConfig, { strict: true });
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

  // Check if active org has ANY sites first
  const activeOrg = findOrg(registry, activeOrgId);
  if (activeOrg && activeOrg.sites.length === 0) {
    throw new EmptyOrgError("No sites in active organization");
  }

  let site = findSite(registry, activeOrgId, activeSiteId);
  let resolvedOrgId = activeOrgId;
  if (!site) {
    // Same stale-cookie recovery as getAdminConfig — search all orgs by
    // siteId so a moved/renamed-org site still resolves to the right config.
    for (const org of registry.orgs) {
      const owned = org.sites.find((s) => s.id === activeSiteId);
      if (owned) { site = owned; resolvedOrgId = org.id; break; }
    }
    if (!site) {
      const firstInOrg = activeOrg?.sites[0];
      if (firstInOrg) {
        const instance = await getOrCreateInstance(activeOrgId, firstInOrg);
        return instance.cms;
      }
      const def = getDefaultSite(registry);
      if (!def) throw new EmptyOrgError("No sites in active organization");
      const instance = await getOrCreateInstance(def.org.id, def.site);
      return instance.cms;
    }
  }

  const instance = await getOrCreateInstance(resolvedOrgId, site);
  return instance.cms;
}

// Re-export from site-paths (single source of truth)
import { EmptyOrgError as _EmptyOrgError } from "./site-paths";
const EmptyOrgError = _EmptyOrgError;
export { _EmptyOrgError as EmptyOrgError };

export async function getAdminConfig(): Promise<CmsConfig> {
  const registry = await loadRegistry();

  if (!registry) {
    const { config } = await getSingleSiteCms();
    return config;
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const activeSiteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;

  // Check if active org has ANY sites first
  const activeOrg = findOrg(registry, activeOrgId);
  if (activeOrg && activeOrg.sites.length === 0) {
    throw new EmptyOrgError("No sites in active organization");
  }

  let site = findSite(registry, activeOrgId, activeSiteId);
  let resolvedOrgId = activeOrgId;
  if (!site) {
    // Cookie's (org, site) pair is stale (org renamed/deleted, or site moved
    // to a different org). FIRST try to find the site by ID in any org —
    // that way a moved/renamed site still resolves to its real config and
    // we don't silently serve another tenant's content. Only fall back to
    // an unrelated default if the site truly doesn't exist anywhere.
    console.warn(`[cms] Site "${activeSiteId}" not found in org "${activeOrgId}" — searching all orgs`);
    for (const org of registry.orgs) {
      const owned = org.sites.find((s) => s.id === activeSiteId);
      if (owned) {
        site = owned;
        resolvedOrgId = org.id;
        console.warn(`[cms] Recovered site "${activeSiteId}" in org "${org.id}" — cookie's org was stale`);
        break;
      }
    }
    if (!site) {
      const firstInOrg = activeOrg?.sites[0];
      if (firstInOrg) {
        site = firstInOrg;
      } else {
        const def = getDefaultSite(registry);
        if (!def) throw new EmptyOrgError("No sites in active organization");
        site = def.site;
        resolvedOrgId = def.org.id;
      }
    }
  }

  const instance = await getOrCreateInstance(resolvedOrgId, site);
  return instance.config;
}

/** Get CMS instance for a specific site (no cookies needed) */
export async function getAdminCmsForSite(orgId: string, siteId: string) {
  const registry = await loadRegistry();
  if (!registry) {
    const { cms } = await getSingleSiteCms();
    return cms;
  }
  const site = findSite(registry, orgId, siteId);
  if (!site) return null;
  const instance = await getOrCreateInstance(orgId, site);
  return instance.cms;
}

/** Get CMS config for a specific site (no cookies needed) */
export async function getAdminConfigForSite(orgId: string, siteId: string) {
  const registry = await loadRegistry();
  if (!registry) {
    const { config } = await getSingleSiteCms();
    return config;
  }
  const site = findSite(registry, orgId, siteId);
  if (!site) return null;
  const instance = await getOrCreateInstance(orgId, site);
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

  let org = registry.orgs.find((o) => o.id === activeOrgId);
  let site = org?.sites.find((s) => s.id === activeSiteId);

  // Stale-cookie recovery: if the (org,site) pair from cookies doesn't
  // resolve, find the site by id in any org so the UI shows the correct
  // org name (matching what getAdminConfig will actually load).
  if (!site) {
    for (const o of registry.orgs) {
      const owned = o.sites.find((s) => s.id === activeSiteId);
      if (owned) { site = owned; org = o; break; }
    }
  }

  return {
    registry,
    activeOrgId: org?.id ?? activeOrgId,
    activeSiteId: site?.id ?? activeSiteId,
    orgName: org?.name ?? activeOrgId,
    siteName: site?.name ?? activeSiteId,
  };
}
