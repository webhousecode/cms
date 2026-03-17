import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageAdapter } from '../storage/sqlite/adapter.js';

describe('SqliteStorageAdapter', () => {
  let tmpDir: string;
  let adapter: SqliteStorageAdapter;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cms-sqlite-test-'));
    adapter = new SqliteStorageAdapter(join(tmpDir, 'content.db'));
    await adapter.initialize();
    await adapter.migrate(['posts', 'pages']);
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

  it('findBySlug is scoped to collection', async () => {
    await adapter.create('posts', { slug: 'home', data: { title: 'Blog Home' } });
    await adapter.create('pages', { slug: 'home', data: { title: 'Page Home' } });

    const postHome = await adapter.findBySlug('posts', 'home');
    const pageHome = await adapter.findBySlug('pages', 'home');

    expect(postHome?.data['title']).toBe('Blog Home');
    expect(pageHome?.data['title']).toBe('Page Home');
  });

  it('lists documents', async () => {
    await adapter.create('posts', { data: { title: 'Post 1' }, status: 'published' });
    await adapter.create('posts', { data: { title: 'Post 2' }, status: 'draft' });

    const all = await adapter.findMany('posts');
    expect(all.total).toBe(2);

    const published = await adapter.findMany('posts', { status: 'published' });
    expect(published.total).toBe(1);
  });

  it('findMany is scoped to collection', async () => {
    await adapter.create('posts', { data: { title: 'Post' }, status: 'published' });
    await adapter.create('pages', { data: { title: 'Page' }, status: 'published' });

    const posts = await adapter.findMany('posts', { status: 'published' });
    expect(posts.total).toBe(1);
    expect(posts.documents[0]!.data['title']).toBe('Post');
  });

  it('updates a document', async () => {
    const doc = await adapter.create('posts', { data: { title: 'Original' } });
    const updated = await adapter.update('posts', doc.id, { data: { title: 'Updated' } });
    expect(updated.data['title']).toBe('Updated');
  });

  it('deletes a document', async () => {
    const doc = await adapter.create('posts', { data: { title: 'To Delete' } });
    await adapter.delete('posts', doc.id);
    const found = await adapter.findById('posts', doc.id);
    expect(found).toBeNull();
  });

  it('sorts by data field (sortOrder) ascending', async () => {
    await adapter.create('posts', { data: { title: 'C', sortOrder: 3 }, status: 'published' });
    await adapter.create('posts', { data: { title: 'A', sortOrder: 1 }, status: 'published' });
    await adapter.create('posts', { data: { title: 'B', sortOrder: 2 }, status: 'published' });

    const asc = await adapter.findMany('posts', { orderBy: 'sortOrder', order: 'asc' });
    expect(asc.documents.map(d => d.data['title'])).toEqual(['A', 'B', 'C']);

    const desc = await adapter.findMany('posts', { orderBy: 'sortOrder', order: 'desc' });
    expect(desc.documents.map(d => d.data['title'])).toEqual(['C', 'B', 'A']);
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

  it('persists _fieldMeta correctly', async () => {
    const doc = await adapter.create('posts', {
      data: { title: 'Test' },
      _fieldMeta: { title: { lockedBy: 'user', lockedAt: '2026-01-01T00:00:00Z' } },
    });
    const found = await adapter.findBySlug('posts', doc.slug);
    expect(found?._fieldMeta['title']?.lockedBy).toBe('user');
  });

  it('total reflects filtered count, not full table count', async () => {
    await adapter.create('posts', { data: { title: 'P', tags: ['cms'] }, status: 'published' });
    await adapter.create('posts', { data: { title: 'Q', tags: ['ai'] }, status: 'published' });
    await adapter.create('posts', { data: { title: 'R', tags: ['cms'] }, status: 'published' });

    const result = await adapter.findMany('posts', { tags: ['cms'], limit: 1 });
    expect(result.documents).toHaveLength(1);
    expect(result.total).toBe(2); // total = all matching, not just page
  });
});
