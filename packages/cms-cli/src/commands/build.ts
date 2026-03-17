import { loadConfig } from '../utils/config-loader.js';
import { logger } from '../utils/logger.js';

export async function buildCommand(args: { outDir?: string; cwd?: string }) {
  const cwd = args.cwd ?? process.cwd();
  logger.info('Loading config...');

  const config = await loadConfig(cwd);

  const { createCms } = await import('@webhouse/cms');
  const cms = await createCms(config);

  logger.info('Building site...');
  const result = await cms.build(args.outDir ? { outDir: args.outDir } : {});

  logger.success(`Build complete in ${result.duration}ms`);
  logger.log(`  Pages: ${result.pages}`);
  logger.log(`  Output: ${result.outDir}/`);

  await cms.storage.close();
}
