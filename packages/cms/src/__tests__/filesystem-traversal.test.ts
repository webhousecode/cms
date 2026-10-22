/**
 * Security W41 H2 — a slug or collection from the request became a file name;
 * `../../../../_data/users` read and wrote the admin's users.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemStorageAdapter, assertPathSegment } from '../storage/filesystem/adapter.js';

describe('filesystem adapter — one path segment per slug and collection', () => {
  let tmpDir: string;
  let adapter: FilesystemStorageAdapter;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cms-trav-'));
    mkdirSync(join(tmpDir, '_data'), { recursive: true });
    writeFileSync(join(tmpDir, '_data', 'users.json'), '{"secret":true}');
    adapter = new FilesystemStorageAdapter(join(tmpDir, 'content'));
    await adapter.initialize();
    await adapter.migrate(['posts']);
  });
  afterEach(async () => { await adapter.close(); rmSync(tmpDir, { recursive: true }); });

  it('refuses to READ outside the collection through the slug', async () => {
    await expect(adapter.findBySlug('posts', '../../_data/users')).rejects.toThrow(/Invalid slug/);
  });

  it('refuses to WRITE outside the collection through the slug or the collection', async () => {
    await expect(adapter.create('posts', { slug: '../../_data/pwned', data: { title: 'x' } })).rejects.toThrow(/Invalid slug/);
    await expect(adapter.create('../_data', { slug: 'pwned', data: { title: 'x' } })).rejects.toThrow(/Invalid collection/);
    expect(existsSync(join(tmpDir, '_data', 'pwned.json'))).toBe(false);
  });

  it('keeps ordinary, dotted and Danish slugs working', async () => {
    for (const slug of ['plain', 'v1.2-release', 'design-i-højere-luftlag', '__probe2__']) {
      const doc = await adapter.create('posts', { slug, data: { title: slug } });
      expect((await adapter.findBySlug('posts', slug))?.id).toBe(doc.id);
    }
  });

  it('assertPathSegment rejects separators, NUL, dot and dot-dot', () => {
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'a\0b']) expect(() => assertPathSegment(bad, 'slug'), JSON.stringify(bad)).toThrow();
  });
});
