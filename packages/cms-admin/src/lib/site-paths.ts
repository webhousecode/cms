/**
 * Site-scoped path resolution.
 *
 * In single-site mode: reads from CMS_CONFIG_PATH env var (as always).
 * In multi-site mode: reads from the active site's registry entry.
 *
 * Every lib that needs projectDir, dataDir, or uploadDir should use this
 * instead of reading CMS_CONFIG_PATH directly.
 */
import path from "node:path";
import { cookies } from "next/headers";
import { loadRegistry, findSite, getDefaultSite } from "./site-registry";

export interface SitePaths {
  configPath: string;    // absolute path to cms.config.ts
  projectDir: string;    // dirname of configPath
  dataDir: string;       // projectDir/_data
  contentDir: string;    // projectDir/content (or registry override)
  uploadDir: string;     // site's upload directory
  previewUrl: string;    // preview site URL
}

/**
 * Get paths for the currently active site.
 * Works in both single-site and multi-site mode.
 */
export async function getActiveSitePaths(): Promise<SitePaths> {
  const registry = await loadRegistry();

  if (!registry) {
    // Single-site mode
    const configPath = process.env.CMS_CONFIG_PATH;
    if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
    const abs = path.resolve(configPath);
    const projectDir = path.dirname(abs);
    return {
      configPath: abs,
      projectDir,
      dataDir: path.join(projectDir, "_data"),
      contentDir: path.join(projectDir, "content"),
      uploadDir: process.env.UPLOAD_DIR ?? path.join(projectDir, "public", "uploads"),
      previewUrl: process.env.NEXT_PUBLIC_PREVIEW_SITE_URL ?? "",
    };
  }

  // Multi-site mode — read from cookies
  let orgId: string;
  let siteId: string;
  try {
    const cookieStore = await cookies();
    orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
    siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
  } catch {
    // cookies() may throw outside request context (e.g. instrumentation)
    orgId = registry.defaultOrgId;
    siteId = registry.defaultSiteId;
  }

  const site = findSite(registry, orgId, siteId);
  if (!site) {
    const def = getDefaultSite(registry);
    if (!def) throw new Error("No sites in registry");
    return siteToPaths(def.site);
  }

  return siteToPaths(site);
}

function siteToPaths(site: { id?: string; configPath: string; contentDir?: string; uploadDir?: string; previewUrl?: string; adapter?: string }): SitePaths {
  // GitHub sites don't have a local project directory — use a cache folder
  if (site.adapter === "github" || site.configPath.startsWith("github://")) {
    const siteId = (site as { id?: string }).id ?? "github-site";
    const homeDir = process.env.HOME ?? "/tmp";
    const cacheDir = path.join(homeDir, ".webhouse", "sites", siteId);
    return {
      configPath: site.configPath,
      projectDir: cacheDir,
      dataDir: path.join(cacheDir, "_data"),
      contentDir: path.join(cacheDir, "content"),
      uploadDir: site.uploadDir ?? path.join(cacheDir, "uploads"),
      previewUrl: site.previewUrl ?? "",
    };
  }

  const abs = path.resolve(site.configPath);
  const projectDir = path.dirname(abs);
  return {
    configPath: abs,
    projectDir,
    dataDir: path.join(site.contentDir ?? path.join(projectDir, "content"), "..", "_data"),
    contentDir: site.contentDir ?? path.join(projectDir, "content"),
    uploadDir: site.uploadDir ?? path.join(projectDir, "public", "uploads"),
    previewUrl: site.previewUrl ?? "",
  };
}

/**
 * Synchronous fallback for cases where cookies() isn't available.
 * Only works in single-site mode. Returns null if CMS_CONFIG_PATH is unset.
 */
export function getSingleSitePathsSync(): SitePaths | null {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) return null;
  const abs = path.resolve(configPath);
  const projectDir = path.dirname(abs);
  return {
    configPath: abs,
    projectDir,
    dataDir: path.join(projectDir, "_data"),
    contentDir: path.join(projectDir, "content"),
    uploadDir: process.env.UPLOAD_DIR ?? path.join(projectDir, "public", "uploads"),
    previewUrl: process.env.NEXT_PUBLIC_PREVIEW_SITE_URL ?? "",
  };
}
