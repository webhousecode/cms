/**
 * Server-side CMS instance for the admin UI.
 * Loads the user's cms.config.ts from CMS_CONFIG_PATH env var,
 * falling back to the local workspace package for development.
 */
import { createCms } from "@webhouse/cms";
import type { CmsConfig } from "@webhouse/cms";
import { dirname, resolve } from "node:path";

let _cms: Awaited<ReturnType<typeof createCms>> | null = null;
let _config: CmsConfig | null = null;

export async function getAdminCms() {
  // Never cache in development — config file may have changed
  if (_cms && process.env.NODE_ENV === "production") return _cms;

  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) {
    throw new Error(
      "CMS_CONFIG_PATH environment variable is not set. " +
      "Point it to your cms.config.ts (or .js) file."
    );
  }

  const absoluteConfigPath = resolve(configPath);
  const projectDir = dirname(absoluteConfigPath);

  // Change cwd to the project dir so relative paths (e.g. contentDir: 'content')
  // resolve correctly in the filesystem adapter
  process.chdir(projectDir);

  // Use jiti for runtime TypeScript transpilation (same as cms-cli)
  const { createJiti } = await import("jiti");
  // moduleCache: false ensures config is re-read on every request in dev
  const jiti = createJiti(absoluteConfigPath, { debug: false, moduleCache: false });
  const mod = await jiti.import(absoluteConfigPath) as { default?: CmsConfig } | CmsConfig;
  _config = ((mod as { default?: CmsConfig }).default ?? mod) as CmsConfig;
  _cms = await createCms(_config);
  return _cms;
}

export async function getAdminConfig(): Promise<CmsConfig> {
  if (_config) return _config;
  await getAdminCms();
  return _config!;
}
