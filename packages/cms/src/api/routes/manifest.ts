import { Hono } from 'hono';
import type { CmsConfig } from '../../schema/types.js';
import { configToManifest } from '../../schema/introspect.js';

export function createManifestRoutes(config: CmsConfig) {
  const app = new Hono();

  app.get('/', (c) => {
    return c.json(configToManifest(config));
  });

  return app;
}
