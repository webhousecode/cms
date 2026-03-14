/**
 * Site Pool — manages lazy-loaded CMS instances per site.
 *
 * Each site gets its own CMS engine instance with its own config,
 * storage adapter, and content service. Instances are cached in memory.
 */
import { createCms } from "@webhouse/cms";
import type { CmsConfig } from "@webhouse/cms";
import { dirname, resolve } from "node:path";
import type { SiteEntry } from "./site-registry";

export interface CmsInstance {
  cms: Awaited<ReturnType<typeof createCms>>;
  config: CmsConfig;
  site: SiteEntry;
}

const pool = new Map<string, CmsInstance>();

function poolKey(orgId: string, siteId: string): string {
  return `${orgId}:${siteId}`;
}

export async function getOrCreateInstance(
  orgId: string,
  site: SiteEntry,
): Promise<CmsInstance> {
  const key = poolKey(orgId, site.id);

  // In dev, always reload config (file may have changed)
  if (pool.has(key) && process.env.NODE_ENV === "production") {
    return pool.get(key)!;
  }

  if (site.adapter === "github") {
    // TODO: implement GitHub config loading + storage adapter
    throw new Error(`GitHub adapter not yet implemented for site "${site.id}"`);
  }

  // Filesystem adapter — load config via jiti
  const absoluteConfigPath = resolve(site.configPath);
  const projectDir = dirname(absoluteConfigPath);

  // Change cwd so relative paths resolve correctly
  process.chdir(projectDir);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(absoluteConfigPath, { debug: false, moduleCache: false });
  const mod = await jiti.import(absoluteConfigPath) as { default?: CmsConfig } | CmsConfig;
  const config = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;

  const cms = await createCms(config);
  const instance: CmsInstance = { cms, config, site };
  pool.set(key, instance);
  return instance;
}

export function invalidate(orgId: string, siteId: string): void {
  pool.delete(poolKey(orgId, siteId));
}

export function invalidateAll(): void {
  pool.clear();
}
