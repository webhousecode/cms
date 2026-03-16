import { loadConfig } from '../utils/config-loader.js';
import { logger } from '../utils/logger.js';
import { GitSyncWatcher } from '../utils/git-sync.js';

export async function devCommand(args: { port?: number; cwd?: string }) {
  const cwd = args.cwd ?? process.cwd();

  const config = await loadConfig(cwd);
  const port = args.port ?? config.api?.port ?? 3000;

  const { createCms } = await import('@webhouse/cms');
  const { serve } = await import('@hono/node-server');

  const cms = await createCms(config);

  logger.info(`Starting dev server on http://localhost:${port}`);
  logger.log('');

  // File watching
  try {
    const chokidar = await import('chokidar');
    const watcher = chokidar.watch(['cms.config.ts', 'content/**/*.json'], {
      cwd,
      ignoreInitial: true,
    });
    watcher.on('all', (event: string, filePath: string) => {
      logger.info(`File changed: ${filePath} (${event})`);
    });
  } catch {
    // chokidar optional
  }

  // Git auto-sync — polls for new commits and auto-pulls (for GitHub-backed sites)
  try {
    const watcher = new GitSyncWatcher({
      cwd,
      intervalMs: 5000,
      onPull: (files) => {
        const contentFiles = files.filter((f) => f.startsWith('content/'));
        const publicFiles = files.filter((f) => f.startsWith('public/'));
        if (contentFiles.length > 0 || publicFiles.length > 0) {
          logger.success(`Auto-pulled ${files.length} change(s) from GitHub`);
          contentFiles.forEach((f) => logger.log(`  ${f}`));
          publicFiles.forEach((f) => logger.log(`  ${f}`));
        }
      },
      onError: (error) => {
        logger.warn(`Git sync: ${error}`);
      },
    });
    await watcher.start();
    logger.info('Git auto-sync enabled (polling every 5s)');
  } catch {
    // Not a git repo or no remote — skip silently
  }

  serve({
    fetch: cms.api.fetch,
    port,
  }, (info: { port: number }) => {
    logger.success(`API running at http://localhost:${info.port}`);
    logger.log('');
    logger.log('Endpoints:');
    logger.log(`  GET  http://localhost:${info.port}/api/manifest`);
    logger.log(`  GET  http://localhost:${info.port}/api/schema`);
    for (const col of config.collections) {
      logger.log(`  GET  http://localhost:${info.port}/api/content/${col.name}`);
    }
  });
}
