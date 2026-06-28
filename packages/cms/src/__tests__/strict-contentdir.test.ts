import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, defineCollection } from '../schema/define.js';
import { createCms } from '../index.js';

// F154 — strict-mode must reject any filesystem config that would silently fall
// back to a relative './content' (ephemeral app-bundle path, wiped every deploy).
// Regression guard for the 2026-06-27 broberg-ai content-wipe incident.

const collections = [defineCollection({ name: 'posts', fields: [{ name: 'title', type: 'text' }] })];
// storage shapes are intentionally malformed in some cases → loosen the type.
const cfg = (storage: unknown) => defineConfig({ collections, storage } as never);

const tmps: string[] = [];
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'cms-f154-'));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) {
    try { rmSync(tmps.pop()!, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('F154 — createCms strict-mode filesystem.contentDir validation', () => {
  it('throws on misplaced flat storage.contentDir (the broberg-ai bug)', async () => {
    await expect(
      createCms(cfg({ adapter: 'filesystem', contentDir: '/abs/content' }), { strict: true }),
    ).rejects.toThrow(/storage\.filesystem\.contentDir|misplaced|nest/i);
  });

  it('throws when a filesystem adapter has no contentDir at all', async () => {
    await expect(
      createCms(cfg({ adapter: 'filesystem' }), { strict: true }),
    ).rejects.toThrow(/contentDir/i);
  });

  it('still throws when filesystem.contentDir is relative (existing behaviour)', async () => {
    await expect(
      createCms(cfg({ adapter: 'filesystem', filesystem: { contentDir: 'content' } }), { strict: true }),
    ).rejects.toThrow(/must be absolute/i);
  });

  it('error message names the ephemeral app-bundle consequence', async () => {
    await expect(
      createCms(cfg({ adapter: 'filesystem', contentDir: './content' }), { strict: true }),
    ).rejects.toThrow(/ephemeral|app bundle|wiped/i);
  });

  it('succeeds with an absolute nested filesystem.contentDir', async () => {
    const dir = mkTmp();
    const cms = await createCms(
      cfg({ adapter: 'filesystem', filesystem: { contentDir: join(dir, 'content') } }),
      { strict: true },
    );
    expect(cms).toBeTruthy();
    await (cms as { close?: () => Promise<void> }).close?.();
  });

  it('non-strict mode is unchanged — no throw for the same flat config', async () => {
    const prev = process.cwd();
    const dir = mkTmp();
    process.chdir(dir);
    try {
      const cms = await createCms(cfg({ adapter: 'filesystem', contentDir: './content' }));
      expect(cms).toBeTruthy();
      await (cms as { close?: () => Promise<void> }).close?.();
    } finally {
      process.chdir(prev);
    }
  });
});
