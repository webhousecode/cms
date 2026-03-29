import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import type { StorageAdapter } from '../storage/types.js';
import type { CmsConfig } from '../schema/types.js';
import { resolveSite } from './resolve.js';
import { renderSite } from './render.js';
import { writeOutput } from './output.js';
import { generateSitemap } from './sitemap.js';
import { applyAutolinks } from './autolink.js';
import { generateLlmsTxt, generateLlmsFullTxt, generateMarkdownPages } from './llms.js';
import { generateAiPlugin } from './ai-plugin.js';
import { generateRobotsTxt } from './robots.js';

export interface BuildOptions {
  outDir?: string;
  /** Include draft documents in the build output. Defaults to false. Also reads INCLUDE_DRAFTS env var. */
  includeDrafts?: boolean;
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
  const includeDrafts = options.includeDrafts ?? process.env.INCLUDE_DRAFTS === 'true';

  // Phase 1: Resolve
  const context = await resolveSite(config, storage, { includeDrafts });

  // Phase 2: Render
  const pages = await renderSite(context);

  // Phase 3: Output
  writeOutput(pages, { outDir });

  // Phase 4: Sitemap
  const baseUrl = config.build?.baseUrl ?? 'https://example.com';
  const sitemap = generateSitemap(context, baseUrl);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'sitemap.xml'), sitemap, 'utf-8');

  // Phase 5: Autolinks — post-process all HTML files
  if (config.autolinks && config.autolinks.length > 0) {
    const htmlFiles = readdirSync(outDir)
      .filter(f => f.endsWith('.html'))
      .map(f => join(outDir, f));
    for (const file of htmlFiles) {
      const original = readFileSync(file, 'utf-8');
      const linked = applyAutolinks(original, config.autolinks);
      if (linked !== original) writeFileSync(file, linked, 'utf-8');
    }
  }

  // Phase 6: AI access files — llms.txt + .well-known/ai-plugin.json
  const llmsTxt = generateLlmsTxt(context, baseUrl);
  writeFileSync(join(outDir, 'llms.txt'), llmsTxt, 'utf-8');

  const wellKnownDir = join(outDir, '.well-known');
  if (!existsSync(wellKnownDir)) mkdirSync(wellKnownDir, { recursive: true });
  writeFileSync(join(wellKnownDir, 'ai-plugin.json'), generateAiPlugin(context, baseUrl), 'utf-8');

  // Phase 7: llms-full.txt + per-page .md files
  const llmsFullTxt = generateLlmsFullTxt(context, baseUrl);
  writeFileSync(join(outDir, 'llms-full.txt'), llmsFullTxt, 'utf-8');

  const mdPages = generateMarkdownPages(context, baseUrl);
  for (const pg of mdPages) {
    const mdPath = join(outDir, pg.path);
    const mdDir = mdPath.substring(0, mdPath.lastIndexOf('/'));
    if (!existsSync(mdDir)) mkdirSync(mdDir, { recursive: true });
    writeFileSync(mdPath, pg.content, 'utf-8');
  }

  // Phase 8: robots.txt — AI-optimized crawler rules
  const robotsTxt = generateRobotsTxt(config.build?.robots ?? {}, baseUrl);
  writeFileSync(join(outDir, 'robots.txt'), robotsTxt, 'utf-8');

  return {
    pages: pages.length,
    outDir,
    duration: Date.now() - start,
  };
}
