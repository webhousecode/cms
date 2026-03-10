import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentService } from '../content/service.js';
import { FilesystemStorageAdapter } from '../storage/filesystem/adapter.js';
import { defineConfig, defineCollection } from '../schema/define.js';

describe('ContentService', () => {
  let tmpDir: string;
  let service: ContentService;

  const config = defineConfig({
    collections: [
      defineCollection({
        name: 'posts',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'content', type: 'richtext' },
        ],
      }),
    ],
  });

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cms-service-test-'));
    const adapter = new FilesystemStorageAdapter(join(tmpDir, 'content'));
    await adapter.initialize();
    await adapter.migrate(['posts']);
    service = new ContentService(adapter, config);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('creates a post via content service', async () => {
    const doc = await service.create('posts', {
      data: { title: 'My Post', content: '# Hello' },
      status: 'published',
    });
    expect(doc.slug).toBe('my-post');
  });

  it('throws for unknown collection', async () => {
    await expect(service.create('unknown', { data: {} })).rejects.toThrow('Collection "unknown" not found');
  });

  it('runs beforeCreate hook', async () => {
    let hookCalled = false;
    const adapter = new FilesystemStorageAdapter(join(tmpDir, 'content2'));
    await adapter.initialize();
    await adapter.migrate(['posts']);

    const serviceWithHook = new ContentService(adapter, config, {
      beforeCreate: (_collection, input) => {
        hookCalled = true;
        return { ...input, data: { ...input.data, hookAdded: true } };
      },
    });

    const doc = await serviceWithHook.create('posts', { data: { title: 'Hook Test' } });
    expect(hookCalled).toBe(true);
    expect(doc.data['hookAdded']).toBe(true);
  });
});
