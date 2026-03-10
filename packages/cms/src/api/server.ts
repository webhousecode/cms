import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { CmsConfig } from '../schema/types.js';
import type { StorageAdapter } from '../storage/types.js';
import { ContentService } from '../content/service.js';
import { createContentRoutes } from './routes/content.js';
import { createSchemaRoutes } from './routes/schema.js';
import { createManifestRoutes } from './routes/manifest.js';

export function createApiServer(config: CmsConfig, storage: StorageAdapter): Hono {
  const app = new Hono();
  const prefix = config.api?.prefix ?? '/api';
  const content = new ContentService(storage, config);

  app.use('*', cors());
  app.use('*', logger());

  app.route(`${prefix}/content`, createContentRoutes(content));
  app.route(`${prefix}/schema`, createSchemaRoutes(config));
  app.route(`${prefix}/manifest`, createManifestRoutes(config));

  app.get('/', (c) => c.json({
    name: '@webhouse/cms',
    version: '0.1.0',
    api: prefix,
  }));

  return app;
}
