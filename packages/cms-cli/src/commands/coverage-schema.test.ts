import { describe, it, expect } from 'vitest';
import {
  parseCoverageSchema,
  summarizeCoverage,
  unionByDocument,
  type CoverageReport,
} from './coverage-schema.js';

// A realistic slice of a `webhouse-schema.json` (toJsonSchema output): a `posts`
// collection mixing text-editable fields with non-text ones, and a `globals`
// collection that wraps its fields in `allOf` (the shape real schemas emit).
const webhouseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  collections: {
    posts: {
      properties: {
        data: {
          properties: {
            title: { type: 'string', 'x-webhouse-field-type': 'text' },
            excerpt: { type: 'string', 'x-webhouse-field-type': 'textarea' },
            content: { type: 'string', 'x-webhouse-field-type': 'richtext' },
            date: { type: 'string', format: 'date', 'x-webhouse-field-type': 'date' },
            tags: { type: 'array', 'x-webhouse-field-type': 'tags' },
            hero: { type: 'string', 'x-webhouse-field-type': 'image' },
          },
        },
      },
    },
    globals: {
      allOf: [
        {
          properties: {
            data: {
              properties: {
                footerText: { type: 'string', 'x-webhouse-field-type': 'text' },
                published: { type: 'boolean', 'x-webhouse-field-type': 'boolean' },
              },
            },
          },
        },
      ],
    },
  },
};

describe('parseCoverageSchema', () => {
  it('keeps only text-editable fields (text/textarea/richtext), drops the rest', () => {
    const schema = parseCoverageSchema(webhouseSchema);
    expect(schema.posts!.fields).toEqual(['title', 'excerpt', 'content']);
    // date, tags, image are NOT text → never expected → not gaps.
    expect(schema.posts!.fields).not.toContain('date');
    expect(schema.posts!.fields).not.toContain('tags');
    expect(schema.posts!.fields).not.toContain('hero');
  });

  it('resolves data.properties nested inside allOf', () => {
    const schema = parseCoverageSchema(webhouseSchema);
    expect(schema.globals!.fields).toEqual(['footerText']); // boolean dropped
  });

  it('parses webhouse.app GET /api/schema shape (collections array with typed fields)', () => {
    // The live CmsConfig shape returned by webhouse.app for bespoke sites.
    const apiSchema = {
      collections: [
        {
          name: 'sections',
          label: 'Sektioner',
          fields: [
            { name: 'heading', type: 'text' },
            { name: 'body', type: 'richtext' },
            { name: 'ctaUrl', type: 'text' }, // text-typed but caller ignores via --ignore
            { name: 'order', type: 'number' }, // non-text → dropped
            { name: 'image', type: 'image' }, // non-text → dropped
          ],
        },
        { name: 'empty', label: 'Empty', fields: [] },
      ],
    };
    const schema = parseCoverageSchema(apiSchema);
    expect(schema.sections!.fields).toEqual(['heading', 'body', 'ctaUrl']);
    expect(schema.empty!.fields).toEqual([]);
  });

  it('passes an already-parsed CoverageSchema through untouched', () => {
    const already = { posts: { fields: ['title', 'body'] } };
    expect(parseCoverageSchema(already)).toEqual(already);
  });

  it('is defensive: junk input yields an empty schema, never throws', () => {
    expect(parseCoverageSchema(null)).toEqual({});
    expect(parseCoverageSchema('nope')).toEqual({});
    expect(parseCoverageSchema({ collections: { x: { junk: true } } })).toEqual({});
  });
});

describe('unionByDocument', () => {
  it('unions present fields across pages so a card context is not a false gap', () => {
    // Post "a" appears twice: as a card on the front page (only title/excerpt),
    // and on its detail page (title/excerpt/content). Neither alone is complete.
    const report: CoverageReport = {
      pages: [
        { collection: 'posts', slug: 'a', present: ['title', 'excerpt'], expected: ['title', 'excerpt', 'content'], missing: ['content'], orphans: [], coveragePct: 67 },
        { collection: 'posts', slug: 'a', present: ['title', 'content'], expected: ['title', 'excerpt', 'content'], missing: ['excerpt'], orphans: [], coveragePct: 67 },
      ],
    };
    const merged = unionByDocument(report);
    expect(merged.pages).toHaveLength(1);
    const p = merged.pages[0]!;
    expect(p.present.sort()).toEqual(['content', 'excerpt', 'title']);
    expect(p.missing).toEqual([]); // covered somewhere → not a gap
    expect(p.coveragePct).toBe(100);
    expect(summarizeCoverage(merged).pass).toBe(true);
  });

  it('still reports a field that is missing on EVERY page', () => {
    const report: CoverageReport = {
      pages: [
        { collection: 'posts', slug: 'b', present: ['title'], expected: ['title', 'body'], missing: ['body'], orphans: [], coveragePct: 50 },
        { collection: 'posts', slug: 'b', present: ['title'], expected: ['title', 'body'], missing: ['body'], orphans: [], coveragePct: 50 },
      ],
    };
    const merged = unionByDocument(report);
    expect(merged.pages[0]!.missing).toEqual(['body']);
    expect(summarizeCoverage(merged).pass).toBe(false);
  });
});

describe('summarizeCoverage', () => {
  const covered: CoverageReport = {
    pages: [
      { collection: 'posts', slug: 'a', present: ['title', 'body'], expected: ['title', 'body'], missing: [], orphans: [], coveragePct: 100 },
    ],
  };
  const withGap: CoverageReport = {
    pages: [
      { collection: 'posts', slug: 'a', present: ['title'], expected: ['title', 'body'], missing: ['body'], orphans: [], coveragePct: 50 },
      { collection: 'posts', slug: 'b', present: ['title', 'body'], expected: ['title', 'body'], missing: [], orphans: [], coveragePct: 100 },
    ],
  };

  it('passes when no page has a missing field', () => {
    const s = summarizeCoverage(covered);
    expect(s.pass).toBe(true);
    expect(s.totalMissing).toBe(0);
    expect(s.coveragePct).toBe(100);
    expect(s.gaps).toEqual([]);
  });

  it('fails and reports the exact gap when a field is un-tagged', () => {
    const s = summarizeCoverage(withGap);
    expect(s.pass).toBe(false);
    expect(s.totalMissing).toBe(1);
    expect(s.gaps).toEqual([{ collection: 'posts', slug: 'a', missing: ['body'] }]);
    // 3 of 4 expected fields covered across both pages → 75%.
    expect(s.coveragePct).toBe(75);
  });

  it('reports 100% when nothing is expected (empty schema site)', () => {
    expect(summarizeCoverage({ pages: [] }).coveragePct).toBe(100);
    expect(summarizeCoverage({ pages: [] }).pass).toBe(true);
  });

  it('baseline (collection/field) accepts current gaps but still fails NEW ones', () => {
    const report: CoverageReport = {
      pages: [
        { collection: 'posts', slug: 'a', present: ['title'], expected: ['title', 'author', 'quote'], missing: ['author', 'quote'], orphans: [], coveragePct: 33 },
      ],
    };
    // baseline accepts posts/author + posts/quote → pass
    const accepted = summarizeCoverage(report, new Set(['posts/author', 'posts/quote']));
    expect(accepted.pass).toBe(true);
    expect(accepted.totalMissing).toBe(0);
    // a NEW gap (posts/body) not in the baseline → fails
    const withNew: CoverageReport = {
      pages: [
        { collection: 'posts', slug: 'a', present: ['title'], expected: ['title', 'author', 'body'], missing: ['author', 'body'], orphans: [], coveragePct: 33 },
      ],
    };
    const caught = summarizeCoverage(withNew, new Set(['posts/author', 'posts/quote']));
    expect(caught.pass).toBe(false);
    expect(caught.gaps).toEqual([{ collection: 'posts', slug: 'a', missing: ['body'] }]);
  });
});
