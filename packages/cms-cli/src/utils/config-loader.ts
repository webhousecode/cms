import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CmsConfig } from '@webhouse/cms';

export async function loadConfig(cwd: string = process.cwd()): Promise<CmsConfig> {
  const configPaths = [
    resolve(cwd, 'cms.config.ts'),
    resolve(cwd, 'cms.config.js'),
    resolve(cwd, 'cms.config.mjs'),
  ];

  const configPath = configPaths.find(p => existsSync(p));
  if (!configPath) {
    throw new Error(
      'No cms.config.ts found. Run "cms init" to create one, or create cms.config.ts manually.'
    );
  }

  // Use jiti for runtime TypeScript transpilation
  const { createJiti } = await import('jiti');
  const jiti = createJiti(cwd, { debug: false });
  const mod = await jiti.import(configPath) as { default?: CmsConfig } | CmsConfig;
  const config = 'default' in (mod as object) ? (mod as { default: CmsConfig }).default : mod as CmsConfig;

  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid config at ${configPath}: must export a default CmsConfig object`);
  }

  return config as CmsConfig;
}
