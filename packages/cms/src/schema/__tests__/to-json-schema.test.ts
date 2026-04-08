/**
 * F125 Phase 1 — Schema Export tests
 *
 * Verifies the CmsConfig → JSON Schema converter handles every field type
 * and produces output that is itself valid JSON Schema (draft 2020-12).
 */
import { describe, it, expect } from 'vitest';
import { toJsonSchema, fieldToSchema } from '../to-json-schema.js';
import type { CmsConfig, FieldConfig } from '../types.js';

const FIXED_TIMESTAMP = '2026-04-08T12:00:00.000Z';

function makeConfig(overrides: Partial<CmsConfig> = {}): CmsConfig {
  return {
    collections: [
      {
        name: 'posts',
        label: 'Blog Posts',
        urlPrefix: '/blog',
        translatable: true,
        kind: 'page',
        description: 'Blog posts. Rendered at /blog/{slug}.',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'content', type: 'richtext' },
          { name: 'date', type: 'date' },
          { name: 'tags', type: 'tags' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('toJsonSchema()', () => {
  describe('top-level structure', () => {
    it('produces a valid draft 2020-12 schema header', () => {
      const result = toJsonSchema(makeConfig(), { generatedAt: FIXED_TIMESTAMP });
      expect(result.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(result['x-webhouse-version']).toBeTruthy();
      expect(result['x-generated-at']).toBe(FIXED_TIMESTAMP);
      expect(result.title).toBe('Webhouse Content Schema');
    });

    it('includes $id when baseUrl is provided', () => {
      const result = toJsonSchema(makeConfig(), {
        baseUrl: 'https://example.com',
        generatedAt: FIXED_TIMESTAMP,
      });
      expect(result.$id).toBe('https://example.com/webhouse-schema.json');
    });

    it('strips trailing slashes from baseUrl', () => {
      const result = toJsonSchema(makeConfig(), {
        baseUrl: 'https://example.com/',
        generatedAt: FIXED_TIMESTAMP,
      });
      expect(result.$id).toBe('https://example.com/webhouse-schema.json');
    });

    it('omits $id when baseUrl is not provided', () => {
      const result = toJsonSchema(makeConfig(), { generatedAt: FIXED_TIMESTAMP });
      expect(result.$id).toBeUndefined();
    });

    it('uses custom title and description when provided', () => {
      const result = toJsonSchema(makeConfig(), {
        title: 'My Blog Schema',
        description: 'Schema for my blog',
        generatedAt: FIXED_TIMESTAMP,
      });
      expect(result.title).toBe('My Blog Schema');
      expect(result.description).toBe('Schema for my blog');
    });
  });

  describe('Document base definition', () => {
    it('defines a Document base in $defs', () => {
      const result = toJsonSchema(makeConfig());
      expect(result.$defs.Document).toBeDefined();
      const doc = result.$defs.Document as Record<string, unknown>;
      expect(doc.type).toBe('object');
      expect(doc.required).toEqual(['slug', 'status', 'data']);
    });

    it('Document base includes locale and translationGroup', () => {
      const result = toJsonSchema(makeConfig());
      const doc = result.$defs.Document as Record<string, unknown>;
      const props = doc.properties as Record<string, unknown>;
      expect(props.locale).toBeDefined();
      expect(props.translationGroup).toBeDefined();
      const tg = props.translationGroup as Record<string, unknown>;
      expect(tg.format).toBe('uuid');
    });

    it('status enum matches storage layer values', () => {
      const result = toJsonSchema(makeConfig());
      const doc = result.$defs.Document as Record<string, unknown>;
      const props = doc.properties as Record<string, unknown>;
      const status = props.status as Record<string, unknown>;
      expect(status.enum).toEqual(['draft', 'published', 'archived', 'expired', 'trashed']);
    });
  });

  describe('collection conversion', () => {
    it('emits one entry per collection', () => {
      const result = toJsonSchema(makeConfig());
      expect(result.collections.posts).toBeDefined();
    });

    it('collection extends Document via allOf $ref', () => {
      const result = toJsonSchema(makeConfig());
      const posts = result.collections.posts as Record<string, unknown>;
      expect(posts.allOf).toEqual([{ $ref: '#/$defs/Document' }]);
    });

    it('collection metadata is in x-webhouse-collection', () => {
      const result = toJsonSchema(makeConfig());
      const posts = result.collections.posts as Record<string, unknown>;
      const meta = posts['x-webhouse-collection'] as Record<string, unknown>;
      expect(meta.name).toBe('posts');
      expect(meta.label).toBe('Blog Posts');
      expect(meta.urlPrefix).toBe('/blog');
      expect(meta.kind).toBe('page');
      expect(meta.translatable).toBe(true);
      expect(meta.description).toBe('Blog posts. Rendered at /blog/{slug}.');
    });

    it('defaults kind to "page" when not specified', () => {
      const config = makeConfig();
      delete config.collections[0]!.kind;
      const result = toJsonSchema(config);
      const posts = result.collections.posts as Record<string, unknown>;
      const meta = posts['x-webhouse-collection'] as Record<string, unknown>;
      expect(meta.kind).toBe('page');
    });

    it('strips undefined fields from x-webhouse-collection', () => {
      const result = toJsonSchema(makeConfig());
      const posts = result.collections.posts as Record<string, unknown>;
      const meta = posts['x-webhouse-collection'] as Record<string, unknown>;
      // parentField wasn't set on the fixture, so it should be absent
      expect('parentField' in meta).toBe(false);
    });

    it('data object lists required fields', () => {
      const result = toJsonSchema(makeConfig());
      const posts = result.collections.posts as Record<string, unknown>;
      const props = posts.properties as Record<string, unknown>;
      const data = props.data as Record<string, unknown>;
      expect(data.required).toEqual(['title']);
    });

    it('data object has properties for every field', () => {
      const result = toJsonSchema(makeConfig());
      const posts = result.collections.posts as Record<string, unknown>;
      const props = posts.properties as Record<string, unknown>;
      const data = props.data as Record<string, unknown>;
      const dataProps = data.properties as Record<string, unknown>;
      expect(dataProps.title).toBeDefined();
      expect(dataProps.content).toBeDefined();
      expect(dataProps.date).toBeDefined();
      expect(dataProps.tags).toBeDefined();
    });
  });

  describe('block conversion', () => {
    it('includes blocks when present', () => {
      const config = makeConfig({
        blocks: [
          {
            name: 'hero',
            label: 'Hero Section',
            fields: [
              { name: 'headline', type: 'text', required: true },
              { name: 'subline', type: 'textarea' },
            ],
          },
        ],
      });
      const result = toJsonSchema(config);
      expect(result.blocks).toBeDefined();
      expect(result.blocks!.hero).toBeDefined();
    });

    it('block has _block discriminator', () => {
      const config = makeConfig({
        blocks: [
          {
            name: 'hero',
            fields: [{ name: 'headline', type: 'text' }],
          },
        ],
      });
      const result = toJsonSchema(config);
      const hero = result.blocks!.hero as Record<string, unknown>;
      const props = hero.properties as Record<string, unknown>;
      const blockField = props._block as Record<string, unknown>;
      expect(blockField.const).toBe('hero');
    });

    it('omits blocks key when includeBlocks is false', () => {
      const config = makeConfig({
        blocks: [{ name: 'hero', fields: [{ name: 'headline', type: 'text' }] }],
      });
      const result = toJsonSchema(config, { includeBlocks: false });
      expect(result.blocks).toBeUndefined();
    });

    it('omits blocks key when no blocks defined', () => {
      const result = toJsonSchema(makeConfig());
      expect(result.blocks).toBeUndefined();
    });
  });
});

describe('fieldToSchema() — every field type', () => {
  it('text → string', () => {
    const r = fieldToSchema({ name: 'title', type: 'text' });
    expect(r.type).toBe('string');
    expect(r['x-webhouse-field-type']).toBe('text');
  });

  it('text with maxLength → string with maxLength', () => {
    const r = fieldToSchema({ name: 'title', type: 'text', maxLength: 60 });
    expect(r.maxLength).toBe(60);
  });

  it('textarea → string', () => {
    const r = fieldToSchema({ name: 'excerpt', type: 'textarea' });
    expect(r.type).toBe('string');
    expect(r['x-webhouse-field-type']).toBe('textarea');
  });

  it('richtext → string with markdown contentMediaType', () => {
    const r = fieldToSchema({ name: 'content', type: 'richtext' });
    expect(r.type).toBe('string');
    expect(r.contentMediaType).toBe('text/markdown');
    expect(r['x-webhouse-field-type']).toBe('richtext');
  });

  it('richtext with features whitelist', () => {
    const r = fieldToSchema({
      name: 'content',
      type: 'richtext',
      features: ['bold', 'italic', 'link'],
    });
    expect(r['x-webhouse-richtext-features']).toEqual(['bold', 'italic', 'link']);
  });

  it('htmldoc → string with html contentMediaType', () => {
    const r = fieldToSchema({ name: 'embed', type: 'htmldoc' });
    expect(r.contentMediaType).toBe('text/html');
  });

  it('number → number', () => {
    const r = fieldToSchema({ name: 'price', type: 'number' });
    expect(r.type).toBe('number');
  });

  it('boolean → boolean', () => {
    const r = fieldToSchema({ name: 'featured', type: 'boolean' });
    expect(r.type).toBe('boolean');
  });

  it('date → string with date format', () => {
    const r = fieldToSchema({ name: 'publishedAt', type: 'date' });
    expect(r.type).toBe('string');
    expect(r.format).toBe('date');
  });

  it('image → string', () => {
    const r = fieldToSchema({ name: 'cover', type: 'image' });
    expect(r.type).toBe('string');
    expect(r['x-webhouse-field-type']).toBe('image');
  });

  it('video → string', () => {
    const r = fieldToSchema({ name: 'trailer', type: 'video' });
    expect(r.type).toBe('string');
    expect(r['x-webhouse-field-type']).toBe('video');
  });

  it('audio → string', () => {
    const r = fieldToSchema({ name: 'podcast', type: 'audio' });
    expect(r.type).toBe('string');
    expect(r['x-webhouse-field-type']).toBe('audio');
  });

  it('file → string', () => {
    const r = fieldToSchema({ name: 'attachment', type: 'file' });
    expect(r.type).toBe('string');
    expect(r['x-webhouse-field-type']).toBe('file');
  });

  it('tags → array of strings', () => {
    const r = fieldToSchema({ name: 'tags', type: 'tags' });
    expect(r.type).toBe('array');
    expect((r.items as Record<string, unknown>).type).toBe('string');
  });

  it('select → string with enum', () => {
    const r = fieldToSchema({
      name: 'category',
      type: 'select',
      options: [
        { label: 'News', value: 'news' },
        { label: 'Tech', value: 'tech' },
      ],
    });
    expect(r.type).toBe('string');
    expect(r.enum).toEqual(['news', 'tech']);
  });

  it('array → array with item properties', () => {
    const r = fieldToSchema({
      name: 'features',
      type: 'array',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'icon', type: 'text' },
      ],
    });
    expect(r.type).toBe('array');
    const items = r.items as Record<string, unknown>;
    expect(items.type).toBe('object');
    expect((items.properties as Record<string, unknown>).title).toBeDefined();
  });

  it('object → object with properties', () => {
    const r = fieldToSchema({
      name: 'address',
      type: 'object',
      fields: [
        { name: 'street', type: 'text' },
        { name: 'city', type: 'text' },
      ],
    });
    expect(r.type).toBe('object');
    expect((r.properties as Record<string, unknown>).street).toBeDefined();
  });

  it('blocks → array with _block discriminator', () => {
    const r = fieldToSchema({ name: 'sections', type: 'blocks', blocks: ['hero', 'cta'] });
    expect(r.type).toBe('array');
    const items = r.items as Record<string, unknown>;
    expect((items.properties as Record<string, unknown>)._block).toBeDefined();
    expect(r['x-webhouse-allowed-blocks']).toEqual(['hero', 'cta']);
  });

  it('relation single → string with x-webhouse-relation', () => {
    const r = fieldToSchema({
      name: 'author',
      type: 'relation',
      collection: 'authors',
      multiple: false,
    });
    expect(r.type).toBe('string');
    const rel = r['x-webhouse-relation'] as Record<string, unknown>;
    expect(rel.collection).toBe('authors');
    expect(rel.multiple).toBe(false);
  });

  it('relation multiple → array of strings', () => {
    const r = fieldToSchema({
      name: 'related',
      type: 'relation',
      collection: 'posts',
      multiple: true,
    });
    expect(r.type).toBe('array');
    expect((r.items as Record<string, unknown>).type).toBe('string');
  });

  it('image-gallery → array of {url, alt}', () => {
    const r = fieldToSchema({ name: 'gallery', type: 'image-gallery' });
    expect(r.type).toBe('array');
    const items = r.items as Record<string, unknown>;
    const props = items.properties as Record<string, unknown>;
    expect(props.url).toBeDefined();
    expect(props.alt).toBeDefined();
    expect(items.required).toEqual(['url']);
  });

  it('interactive → string', () => {
    const r = fieldToSchema({ name: 'widget', type: 'interactive' });
    expect(r.type).toBe('string');
  });

  it('column-slots → object', () => {
    const r = fieldToSchema({ name: 'columns', type: 'column-slots' });
    expect(r.type).toBe('object');
  });

  it('map → object with lat/lng', () => {
    const r = fieldToSchema({ name: 'location', type: 'map' });
    expect(r.type).toBe('object');
    const props = r.properties as Record<string, unknown>;
    expect(props.lat).toBeDefined();
    expect(props.lng).toBeDefined();
  });

  it('all field types preserve x-webhouse-field-type', () => {
    const types: FieldConfig['type'][] = [
      'text', 'textarea', 'richtext', 'number', 'boolean', 'date',
      'image', 'video', 'audio', 'file', 'tags', 'select', 'array',
      'object', 'blocks', 'relation', 'image-gallery', 'interactive',
      'column-slots', 'map', 'htmldoc',
    ];
    for (const type of types) {
      const r = fieldToSchema({ name: 'f', type } as FieldConfig);
      expect(r['x-webhouse-field-type']).toBe(type);
    }
  });

  it('preserves AI hints when present', () => {
    const r = fieldToSchema({
      name: 'title',
      type: 'text',
      ai: { hint: 'A catchy title under 60 chars' },
    });
    expect(r['x-webhouse-ai-hint']).toBe('A catchy title under 60 chars');
  });
});

describe('integration — real-world config', () => {
  it('handles a multi-collection blog config', () => {
    const config: CmsConfig = {
      collections: [
        {
          name: 'posts',
          label: 'Posts',
          urlPrefix: '/blog',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'content', type: 'richtext' },
            { name: 'author', type: 'relation', collection: 'authors' },
            { name: 'tags', type: 'tags' },
            { name: 'cover', type: 'image' },
          ],
        },
        {
          name: 'authors',
          label: 'Authors',
          kind: 'data',
          fields: [
            { name: 'name', type: 'text', required: true },
            { name: 'bio', type: 'textarea' },
          ],
        },
        {
          name: 'globals',
          label: 'Site Globals',
          kind: 'global',
          fields: [
            { name: 'siteTitle', type: 'text', required: true },
            { name: 'tagline', type: 'text' },
          ],
        },
      ],
      defaultLocale: 'en',
      locales: ['en', 'da'],
    };

    const result = toJsonSchema(config);
    expect(Object.keys(result.collections)).toEqual(['posts', 'authors', 'globals']);

    const posts = result.collections.posts as Record<string, unknown>;
    const postsMeta = posts['x-webhouse-collection'] as Record<string, unknown>;
    expect(postsMeta.kind).toBe('page');

    const authors = result.collections.authors as Record<string, unknown>;
    const authorsMeta = authors['x-webhouse-collection'] as Record<string, unknown>;
    expect(authorsMeta.kind).toBe('data');

    const globals = result.collections.globals as Record<string, unknown>;
    const globalsMeta = globals['x-webhouse-collection'] as Record<string, unknown>;
    expect(globalsMeta.kind).toBe('global');
  });

  it('output is JSON-serializable', () => {
    const result = toJsonSchema(makeConfig({ blocks: [{ name: 'hero', fields: [{ name: 'h', type: 'text' }] }] }));
    expect(() => JSON.stringify(result)).not.toThrow();
    const json = JSON.stringify(result);
    expect(json.length).toBeGreaterThan(100);
  });

  it('output is round-trippable through JSON', () => {
    const result = toJsonSchema(makeConfig());
    const reparsed = JSON.parse(JSON.stringify(result));
    expect(reparsed.$schema).toBe(result.$schema);
    expect(reparsed.collections.posts).toEqual(result.collections.posts);
  });
});
