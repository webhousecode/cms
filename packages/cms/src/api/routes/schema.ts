import { Hono } from 'hono';
import type { CmsConfig } from '../../schema/types.js';
import { collectionToJsonSchema } from '../../schema/introspect.js';

export function createSchemaRoutes(config: CmsConfig) {
  const app = new Hono();

  app.get('/', (c) => {
    const schemas = config.collections.map(col => ({
      name: col.name,
      label: col.label ?? col.name,
      slug: col.slug ?? col.name,
      jsonSchema: collectionToJsonSchema(col),
    }));
    return c.json({ collections: schemas, blocks: config.blocks ?? [] });
  });

  app.get('/:collection', (c) => {
    const name = c.req.param('collection');
    const col = config.collections.find(col => col.name === name);
    if (!col) return c.json({ error: 'Collection not found' }, 404);
    return c.json({
      name: col.name,
      label: col.label ?? col.name,
      jsonSchema: collectionToJsonSchema(col),
    });
  });

  return app;
}
