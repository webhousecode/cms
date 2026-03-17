import { Hono } from 'hono';
import type { ContentService } from '../../content/service.js';
import type { Document, DocumentFieldMeta } from '../../storage/types.js';

/** Strip _fieldMeta from a document for standard GET responses */
function stripFieldMeta(doc: Document): Omit<Document, '_fieldMeta'> {
  const { _fieldMeta: _ignored, ...rest } = doc;
  return rest;
}

export function createContentRoutes(content: ContentService) {
  const app = new Hono();

  // List documents (no _fieldMeta in response)
  app.get('/:collection', async (c) => {
    const collection = c.req.param('collection');
    const status = c.req.query('status') as 'draft' | 'published' | 'archived' | undefined;
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined;

    try {
      const opts: import('../../storage/types.js').QueryOptions = {};
      if (status) opts.status = status;
      if (limit !== undefined) opts.limit = limit;
      if (offset !== undefined) opts.offset = offset;
      const result = await content.findMany(collection, opts);
      return c.json({
        documents: result.documents.map(stripFieldMeta),
        total: result.total,
      });
    } catch (e) {
      return c.json({ error: String(e) }, 404);
    }
  });

  // --- Field meta endpoints (must come BEFORE /:collection/:slug to match correctly) ---

  // GET field meta for a document
  app.get('/:collection/:slug/_fieldMeta', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');
    try {
      const doc = await content.findBySlug(collection, slug);
      if (!doc) return c.json({ error: 'Not found' }, 404);
      return c.json(doc._fieldMeta ?? {});
    } catch (e) {
      return c.json({ error: String(e) }, 404);
    }
  });

  // Manual lock a single field
  app.put('/:collection/:slug/_fieldMeta/:fieldPath/lock', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');
    const fieldPath = c.req.param('fieldPath');
    try {
      const doc = await content.findBySlug(collection, slug);
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const body = await c.req.json().catch(() => ({})) as { userId?: string; reason?: string };
      const updatedMeta: DocumentFieldMeta = {
        ...doc._fieldMeta,
        [fieldPath]: {
          ...(doc._fieldMeta?.[fieldPath] ?? {}),
          lockedBy: 'user',
          lockedAt: new Date().toISOString(),
          ...(body.userId ? { userId: body.userId } : {}),
          reason: body.reason ?? 'manual-lock',
        },
      };

      await content.update(collection, doc.id, { _fieldMeta: updatedMeta });
      return c.json(updatedMeta[fieldPath]);
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  // Unlock a single field
  app.put('/:collection/:slug/_fieldMeta/:fieldPath/unlock', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');
    const fieldPath = c.req.param('fieldPath');
    try {
      const doc = await content.findBySlug(collection, slug);
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const existing = doc._fieldMeta?.[fieldPath] ?? {};
      const { lockedBy: _lb, lockedAt: _la, userId: _uid, reason: _r, ...rest } = existing;
      const updatedMeta: DocumentFieldMeta = {
        ...doc._fieldMeta,
        [fieldPath]: rest,
      };

      await content.update(collection, doc.id, { _fieldMeta: updatedMeta });
      return c.json(updatedMeta[fieldPath]);
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  // Lock all AI-generated fields
  app.put('/:collection/:slug/_fieldMeta/lock-all', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');
    try {
      const doc = await content.findBySlug(collection, slug);
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const body = await c.req.json().catch(() => ({})) as { userId?: string };
      const timestamp = new Date().toISOString();
      const updatedMeta: DocumentFieldMeta = {};

      for (const [field, meta] of Object.entries(doc._fieldMeta ?? {})) {
        updatedMeta[field] = meta?.aiGenerated
          ? { ...meta, lockedBy: 'user' as const, lockedAt: timestamp, ...(body.userId ? { userId: body.userId } : {}), reason: 'manual-lock-all' }
          : meta;
      }

      await content.update(collection, doc.id, { _fieldMeta: updatedMeta });
      return c.json(updatedMeta);
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  // Unlock all fields
  app.put('/:collection/:slug/_fieldMeta/unlock-all', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');
    try {
      const doc = await content.findBySlug(collection, slug);
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const updatedMeta: DocumentFieldMeta = {};
      for (const [field, meta] of Object.entries(doc._fieldMeta ?? {})) {
        const { lockedBy: _lb, lockedAt: _la, userId: _uid, reason: _r, ...rest } = meta ?? {};
        updatedMeta[field] = rest;
      }

      await content.update(collection, doc.id, { _fieldMeta: updatedMeta });
      return c.json(updatedMeta);
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  // Get by slug (no _fieldMeta in response)
  app.get('/:collection/:slug', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');

    try {
      const doc = await content.findBySlug(collection, slug);
      if (!doc) return c.json({ error: 'Not found' }, 404);
      return c.json(stripFieldMeta(doc));
    } catch (e) {
      return c.json({ error: String(e) }, 404);
    }
  });

  // Create (actor: user)
  app.post('/:collection', async (c) => {
    const collection = c.req.param('collection');
    try {
      const body = await c.req.json() as { slug?: string; status?: 'draft' | 'published' | 'archived'; data: Record<string, unknown> };
      const input: import('../../storage/types.js').DocumentInput = { data: body.data };
      if (body.slug) input.slug = body.slug;
      if (body.status) input.status = body.status;
      const doc = await content.create(collection, input, { actor: 'user' });
      return c.json(stripFieldMeta(doc), 201);
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  // Update (actor: user)
  app.put('/:collection/:slug', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');

    try {
      const existing = await content.findBySlug(collection, slug);
      if (!existing) return c.json({ error: 'Not found' }, 404);

      const body = await c.req.json() as { slug?: string; status?: 'draft' | 'published' | 'archived'; data?: Record<string, unknown> };
      const partial: Partial<import('../../storage/types.js').DocumentInput> = {};
      if (body.slug) partial.slug = body.slug;
      if (body.status) partial.status = body.status;
      if (body.data) partial.data = body.data;
      const doc = await content.update(collection, existing.id, partial, { actor: 'user' });
      return c.json(stripFieldMeta(doc));
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  // Delete
  app.delete('/:collection/:slug', async (c) => {
    const collection = c.req.param('collection');
    const slug = c.req.param('slug');

    try {
      const existing = await content.findBySlug(collection, slug);
      if (!existing) return c.json({ error: 'Not found' }, 404);
      await content.delete(collection, existing.id, { actor: 'user' });
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  });

  return app;
}
