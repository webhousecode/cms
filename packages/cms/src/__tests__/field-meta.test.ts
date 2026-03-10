import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentService } from '../content/service.js';
import { FilesystemStorageAdapter } from '../storage/filesystem/adapter.js';
import { defineConfig, defineCollection } from '../schema/define.js';
import {
  isFieldLocked,
  getLockedFields,
  filterUnlockedFields,
  computeFieldMetaChanges,
  buildInitialFieldMeta,
} from '../content/field-meta.js';

describe('field-meta helpers', () => {
  it('isFieldLocked returns false for empty meta', () => {
    expect(isFieldLocked({}, 'title')).toBe(false);
  });

  it('isFieldLocked returns false for aiGenerated-only field', () => {
    expect(isFieldLocked({ title: { aiGenerated: true } }, 'title')).toBe(false);
  });

  it('isFieldLocked returns true for locked field', () => {
    expect(isFieldLocked({ title: { lockedBy: 'user', lockedAt: '2024-01-01' } }, 'title')).toBe(true);
  });

  it('getLockedFields returns only locked fields', () => {
    const meta = {
      title: { lockedBy: 'user' as const, lockedAt: '2024-01-01' },
      content: { aiGenerated: true },
      summary: { lockedBy: 'import' as const, lockedAt: '2024-01-01' },
    };
    expect(getLockedFields(meta)).toEqual(['title', 'summary']);
  });

  it('filterUnlockedFields excludes locked fields', () => {
    const meta = {
      title: { lockedBy: 'user' as const, lockedAt: '2024-01-01' },
      content: { aiGenerated: true },
    };
    expect(filterUnlockedFields(meta, ['title', 'content', 'summary'])).toEqual(['content', 'summary']);
  });

  it('buildInitialFieldMeta marks all fields as aiGenerated for ai actor', () => {
    const data = { title: 'Hello', content: 'World' };
    const meta = buildInitialFieldMeta(data, { actor: 'ai', aiModel: 'gpt-4' });
    expect(meta['title']?.aiGenerated).toBe(true);
    expect(meta['content']?.aiGenerated).toBe(true);
    expect(meta['title']?.aiModel).toBe('gpt-4');
  });

  it('buildInitialFieldMeta returns empty meta for user actor', () => {
    const data = { title: 'Hello' };
    const meta = buildInitialFieldMeta(data, { actor: 'user' });
    expect(meta).toEqual({});
  });
});

describe('computeFieldMetaChanges', () => {
  it('user editing AI-generated field → auto-locks', () => {
    const existingMeta = { title: { aiGenerated: true, aiGeneratedAt: '2024-01-01' } };
    const { filteredData, updatedMeta, skippedFields } = computeFieldMetaChanges(
      { title: 'AI title' },
      { title: 'Human title' },
      existingMeta,
      { actor: 'user', userId: 'user-123' },
    );
    expect(filteredData['title']).toBe('Human title');
    expect(updatedMeta['title']?.lockedBy).toBe('user');
    expect(updatedMeta['title']?.userId).toBe('user-123');
    expect(updatedMeta['title']?.reason).toBe('user-edit');
    expect(skippedFields).toHaveLength(0);
  });

  it('user editing non-AI field → no lock set', () => {
    const { filteredData, updatedMeta, skippedFields } = computeFieldMetaChanges(
      { title: 'Old title' },
      { title: 'New title' },
      {},
      { actor: 'user' },
    );
    expect(filteredData['title']).toBe('New title');
    expect(updatedMeta['title']?.lockedBy).toBeUndefined();
    expect(skippedFields).toHaveLength(0);
  });

  it('AI writing to locked field → field is skipped', () => {
    const existingMeta = {
      title: { lockedBy: 'user' as const, lockedAt: '2024-01-01', userId: 'user-123' },
    };
    const { filteredData, skippedFields } = computeFieldMetaChanges(
      { title: 'Human title' },
      { title: 'AI rewrite' },
      existingMeta,
      { actor: 'ai', aiModel: 'claude-3' },
    );
    expect(filteredData['title']).toBeUndefined();
    expect(skippedFields).toContain('title');
  });

  it('AI writing to unlocked field → marks as aiGenerated', () => {
    const { filteredData, updatedMeta, skippedFields } = computeFieldMetaChanges(
      { content: 'Old content' },
      { content: 'AI content' },
      {},
      { actor: 'ai', aiModel: 'claude-3' },
    );
    expect(filteredData['content']).toBe('AI content');
    expect(updatedMeta['content']?.aiGenerated).toBe(true);
    expect(updatedMeta['content']?.aiModel).toBe('claude-3');
    expect(skippedFields).toHaveLength(0);
  });

  it('import actor locks field with import reason', () => {
    const { filteredData, updatedMeta, skippedFields } = computeFieldMetaChanges(
      { title: 'Old' },
      { title: 'Imported' },
      {},
      { actor: 'import', userId: 'import-job-1' },
    );
    expect(filteredData['title']).toBe('Imported');
    expect(updatedMeta['title']?.lockedBy).toBe('import');
    expect(updatedMeta['title']?.reason).toBe('import');
    expect(updatedMeta['title']?.userId).toBe('import-job-1');
    expect(skippedFields).toHaveLength(0);
  });

  it('unchanged fields pass through without meta changes', () => {
    const existingMeta = { title: { aiGenerated: true } };
    const { filteredData, updatedMeta, skippedFields } = computeFieldMetaChanges(
      { title: 'Same value' },
      { title: 'Same value' },
      existingMeta,
      { actor: 'ai' },
    );
    expect(filteredData['title']).toBe('Same value');
    // Meta unchanged — no new lock, no new aiGenerated stamp
    expect(updatedMeta['title']).toEqual({ aiGenerated: true });
    expect(skippedFields).toHaveLength(0);
  });
});

describe('ContentService field-meta integration', () => {
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
    tmpDir = mkdtempSync(join(tmpdir(), 'cms-field-meta-test-'));
    const adapter = new FilesystemStorageAdapter(join(tmpDir, 'content'));
    await adapter.initialize();
    await adapter.migrate(['posts']);
    service = new ContentService(adapter, config);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('document starts with empty _fieldMeta', async () => {
    const doc = await service.create('posts', { data: { title: 'Hello' } });
    expect(doc._fieldMeta).toEqual({});
  });

  it('AI create → fields marked aiGenerated', async () => {
    const doc = await service.create(
      'posts',
      { data: { title: 'AI Title', content: 'AI Content' } },
      { actor: 'ai', aiModel: 'claude-test' },
    );
    expect(doc._fieldMeta['title']?.aiGenerated).toBe(true);
    expect(doc._fieldMeta['content']?.aiGenerated).toBe(true);
    expect(doc._fieldMeta['title']?.aiModel).toBe('claude-test');
  });

  it('user edit of AI field → auto-locks', async () => {
    const created = await service.create(
      'posts',
      { data: { title: 'AI Title', content: 'AI Content' } },
      { actor: 'ai', aiModel: 'claude-test' },
    );

    const updated = await service.update(
      'posts',
      created.id,
      { data: { title: 'Human Title' } },
      { actor: 'user', userId: 'user-abc' },
    );

    expect(updated._fieldMeta['title']?.lockedBy).toBe('user');
    expect(updated._fieldMeta['title']?.userId).toBe('user-abc');
    // content was not touched — still aiGenerated, not locked
    expect(updated._fieldMeta['content']?.lockedBy).toBeUndefined();
    expect(updated._fieldMeta['content']?.aiGenerated).toBe(true);
  });

  it('AI rewrite skips locked fields', async () => {
    const created = await service.create(
      'posts',
      { data: { title: 'AI Title', content: 'AI Content' } },
      { actor: 'ai', aiModel: 'claude-test' },
    );

    // User locks title
    await service.update(
      'posts',
      created.id,
      { data: { title: 'Human Title' } },
      { actor: 'user', userId: 'user-abc' },
    );

    // AI tries to rewrite both fields
    const { document: rewrote, skippedFields } = await service.updateWithContext(
      'posts',
      created.id,
      { data: { title: 'AI Rewrite Title', content: 'AI Rewrite Content' } },
      { actor: 'ai', aiModel: 'claude-test' },
    );

    expect(skippedFields).toContain('title');
    expect(rewrote.data['title']).toBe('Human Title'); // unchanged
    expect(rewrote.data['content']).toBe('AI Rewrite Content'); // updated
  });

  it('lock survives a read/write cycle', async () => {
    const created = await service.create(
      'posts',
      { data: { title: 'AI Title' } },
      { actor: 'ai', aiModel: 'test' },
    );

    await service.update(
      'posts',
      created.id,
      { data: { title: 'Locked Title' } },
      { actor: 'user', userId: 'u1' },
    );

    // Re-read the document
    const loaded = await service.findById('posts', created.id);
    expect(loaded!._fieldMeta['title']?.lockedBy).toBe('user');
  });

  it('document without _fieldMeta → all fields treated as unlocked', async () => {
    // Simulate old document with no _fieldMeta by creating with user context (empty meta)
    const created = await service.create(
      'posts',
      { data: { title: 'Plain Title' } },
      { actor: 'user' },
    );
    expect(created._fieldMeta).toEqual({});

    // AI can freely write
    const { document: updated, skippedFields } = await service.updateWithContext(
      'posts',
      created.id,
      { data: { title: 'AI Updated Title' } },
      { actor: 'ai' },
    );
    expect(skippedFields).toHaveLength(0);
    expect(updated.data['title']).toBe('AI Updated Title');
  });
});
