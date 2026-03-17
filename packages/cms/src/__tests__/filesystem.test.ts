import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemStorageAdapter } from '../storage/filesystem/adapter.js';

describe('FilesystemStorageAdapter', () => {
  let tmpDir: string;
  let adapter: FilesystemStorageAdapter;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cms-test-'));
    adapter = new FilesystemStorageAdapter(join(tmpDir, 'content'));
    await adapter.initialize();
    await adapter.migrate(['posts']);
  });

  afterEach(async () => {
    await adapter.close();
    rmSync(tmpDir, { recursive: true });
  });

  it('creates and retrieves a document', async () => {
    const doc = await adapter.create('posts', {
      data: { title: 'Test Post', content: 'Hello world' },
      status: 'published',
    });

    expect(doc.id).toBeTruthy();
    expect(doc.slug).toBe('test-post');
    expect(doc.status).toBe('published');
    expect(doc.data['title']).toBe('Test Post');

    const found = await adapter.findBySlug('posts', 'test-post');
    expect(found?.id).toBe(doc.id);
  });

  it('lists documents', async () => {
    await adapter.create('posts', { data: { title: 'Post 1' }, status: 'published' });
    await adapter.create('posts', { data: { title: 'Post 2' }, status: 'draft' });

    const all = await adapter.findMany('posts');
    expect(all.total).toBe(2);

    const published = await adapter.findMany('posts', { status: 'published' });
    expect(published.total).toBe(1);
  });

  it('updates a document', async () => {
    const doc = await adapter.create('posts', { data: { title: 'Original' } });
    const updated = await adapter.update('posts', doc.id, { data: { title: 'Updated' } });
    expect(updated.data['title']).toBe('Updated');
  });

  it('sorts by data field (sortOrder)', async () => {
    await adapter.create('posts', { data: { title: 'C', sortOrder: 3 }, status: 'published' });
    await adapter.create('posts', { data: { title: 'A', sortOrder: 1 }, status: 'published' });
    await adapter.create('posts', { data: { title: 'B', sortOrder: 2 }, status: 'published' });

    const asc = await adapter.findMany('posts', { orderBy: 'sortOrder', order: 'asc' });
    expect(asc.documents.map(d => d.data['title'])).toEqual(['A', 'B', 'C']);

    const desc = await adapter.findMany('posts', { orderBy: 'sortOrder', order: 'desc' });
    expect(desc.documents.map(d => d.data['title'])).toEqual(['C', 'B', 'A']);
  });

  it('backfills _fieldMeta when missing from JSON', async () => {
    const doc = await adapter.create('posts', { data: { title: 'Test' } });
    const found = await adapter.findBySlug('posts', doc.slug);
    expect(found?._fieldMeta).toEqual({});
  });

  it('filters by single tag', async () => {
    await adapter.create('posts', { data: { title: 'Tagged A', tags: ['cms', 'ai'] }, status: 'published' });
    await adapter.create('posts', { data: { title: 'Tagged B', tags: ['cms'] }, status: 'published' });
    await adapter.create('posts', { data: { title: 'Untagged' }, status: 'published' });

    const cms = await adapter.findMany('posts', { tags: ['cms'] });
    expect(cms.total).toBe(2);
    expect(cms.documents.map(d => d.data['title'])).toContain('Tagged A');
    expect(cms.documents.map(d => d.data['title'])).toContain('Tagged B');
  });

  it('filters by multiple tags (AND logic)', async () => {
    await adapter.create('posts', { data: { title: 'Both', tags: ['cms', 'ai'] }, status: 'published' });
    await adapter.create('posts', { data: { title: 'CMS only', tags: ['cms'] }, status: 'published' });

    const both = await adapter.findMany('posts', { tags: ['cms', 'ai'] });
    expect(both.total).toBe(1);
    expect(both.documents[0]!.data['title']).toBe('Both');
  });

  it('returns empty when no documents match tag', async () => {
    await adapter.create('posts', { data: { title: 'Post', tags: ['cms'] }, status: 'published' });
    const result = await adapter.findMany('posts', { tags: ['nonexistent'] });
    expect(result.total).toBe(0);
  });

  it('deletes a document', async () => {
    const doc = await adapter.create('posts', { data: { title: 'To Delete' } });
    await adapter.delete('posts', doc.id);
    const found = await adapter.findById('posts', doc.id);
    expect(found).toBeNull();
  });
});
