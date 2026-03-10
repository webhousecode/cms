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

  it('deletes a document', async () => {
    const doc = await adapter.create('posts', { data: { title: 'To Delete' } });
    await adapter.delete('posts', doc.id);
    const found = await adapter.findById('posts', doc.id);
    expect(found).toBeNull();
  });
});
