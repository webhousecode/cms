import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { StorageAdapter } from '../storage/types.js';
import type { CmsConfig } from '../schema/types.js';
import { resolveSite } from './resolve.js';
import { renderSite } from './render.js';
import { writeOutput } from './output.js';
import { generateSitemap } from './sitemap.js';

export interface BuildOptions {
  outDir?: string;
}

export interface BuildResult {
  pages: number;
  outDir: string;
  duration: number;
}

export async function runBuild(
  config: CmsConfig,
  storage: StorageAdapter,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const start = Date.now();
  const outDir = options.outDir ?? config.build?.outDir ?? 'dist';

  // Phase 1: Resolve
  const context = await resolveSite(config, storage);

  // Phase 2: Render
  const pages = await renderSite(context);

  // Phase 3: Output
  writeOutput(pages, { outDir });

  // Phase 4: Sitemap
  const baseUrl = config.build?.baseUrl ?? 'https://example.com';
  const sitemap = generateSitemap(context, baseUrl);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'sitemap.xml'), sitemap, 'utf-8');

  return {
    pages: pages.length,
    outDir,
    duration: Date.now() - start,
  };
}
