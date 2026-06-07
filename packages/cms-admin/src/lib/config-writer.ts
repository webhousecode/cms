import { readFileSync, writeFileSync } from 'node:fs';
import type { CmsConfig, FieldConfig } from '@webhouse/cms';
import { findMatchingBracket } from './schema-field-infer';

export interface CollectionDef {
  name: string;
  label?: string;
  urlPrefix?: string;
  urlPattern?: string;
  translatable?: boolean;
  previewable?: boolean;
  fields: FieldConfig[];
  /** Permissive: any other collection-level prop is preserved verbatim. */
  [key: string]: unknown;
}

/**
 * config-writer rewrites the `collections` array of a cms.config.ts when the
 * schema editor changes it. The hard part is NOT losing anything else.
 *
 * History of data-loss bugs this module has caused:
 *  - 2026-05-19: dropped `locales` / `defaultLocale` on every schema edit
 *    (the rewriter only knew a fixed allow-list of top-level fields).
 *  - 2026-06-07: the previous serializer also silently dropped `urlPattern`,
 *    nested array `fields`, `forms`, and most FieldConfig props (defaultValue,
 *    maxLength, options-on-nested, features, ai, aiLock, …) because it emitted
 *    only a hand-listed subset of properties.
 *
 * Root-cause fix: stop rebuilding the file from an allow-list. Instead replace
 * ONLY the `collections: [ … ]` array span in the original source and leave
 * every other byte untouched (locales, i18n, blocks, autolinks, forms, storage,
 * comments, formatting, and any future top-level field — all preserved for
 * free). The collections themselves are serialized GENERICALLY, so no field or
 * collection property can be dropped regardless of its name.
 */

// ─── Generic value serializer ────────────────────────────

function emitKey(k: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
}

/** Serialize any plain JSON-ish value to a single-line TS literal. Lossless. */
function emitInline(v: unknown): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'number' || t === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return `[${v.map(emitInline).join(', ')}]`;
  }
  if (t === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined);
    if (entries.length === 0) return '{}';
    return `{ ${entries.map(([k, val]) => `${emitKey(k)}: ${emitInline(val)}`).join(', ')} }`;
  }
  // functions/symbols/undefined have no place in a serialized config field.
  return 'null';
}

function serializeCollection(col: CollectionDef): string {
  const { fields, ...rest } = col;
  const lines: string[] = ['    defineCollection({'];
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    lines.push(`      ${emitKey(k)}: ${emitInline(v)},`);
  }
  lines.push('      fields: [');
  for (const f of fields ?? []) {
    lines.push(`        ${emitInline(f)},`);
  }
  lines.push('      ],');
  lines.push('    })');
  return lines.join('\n');
}

function buildCollectionsArray(collections: CollectionDef[]): string {
  if (collections.length === 0) return '[]';
  return `[\n${collections.map(serializeCollection).join(',\n')}\n  ]`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace only the top-level `collections: [ … ]` array in `source`,
 * preserving every other byte. Throws (so the caller does NOT write) if the
 * array can't be located or is unbalanced.
 */
export function replaceCollectionsArray(source: string, collections: CollectionDef[]): string {
  const m = /(^|\n)([ \t]*)collections[ \t]*:[ \t]*\[/.exec(source);
  if (!m) {
    throw new Error('config-writer: could not locate top-level `collections:` array in cms.config.ts');
  }
  const bracketIdx = m.index + m[0].length - 1; // index of the opening '['
  const closeIdx = findMatchingBracket(source, bracketIdx);
  if (closeIdx < 0) {
    throw new Error('config-writer: unbalanced `collections` array in cms.config.ts');
  }
  return source.slice(0, bracketIdx) + buildCollectionsArray(collections) + source.slice(closeIdx + 1);
}

/** Guardrail: never persist a result that lost defineConfig or a collection. */
function assertConfigIntact(original: string, updated: string, collections: CollectionDef[]): void {
  if (!updated.includes('defineConfig')) {
    throw new Error('config-writer: refusing to write — result no longer contains defineConfig');
  }
  for (const c of collections) {
    const re = new RegExp(`name:\\s*["']${escapeRegExp(c.name)}["']`);
    if (!re.test(updated)) {
      throw new Error(`config-writer: refusing to write — collection "${c.name}" missing from result`);
    }
  }
}

// ─── GitHub helpers ──────────────────────────────────────

function parseGitHubPath(configPath: string): { owner: string; repo: string; path: string } | null {
  if (!configPath.startsWith('github://')) return null;
  const parts = configPath.replace('github://', '').split('/');
  return { owner: parts[0], repo: parts[1], path: parts.slice(2).join('/') || 'cms.config.ts' };
}

async function getGitHubToken(): Promise<string> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get('github-token')?.value;
  if (!token) throw new Error('GitHub not connected — please connect via Sites');
  return token;
}

async function readGitHubFile(owner: string, repo: string, filePath: string, token: string): Promise<{ content: string; sha: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub: read ${filePath} failed: ${res.status}`);
  const data = await res.json() as { content: string; sha: string };
  return {
    content: Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8'),
    sha: data.sha,
  };
}

async function writeGitHubFile(owner: string, repo: string, filePath: string, content: string, sha: string, token: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'chore: update schema via CMS admin',
      content: Buffer.from(content).toString('base64'),
      sha,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub: write ${filePath} failed: ${res.status} ${body}`);
  }
}

// ─── Public API ──────────────────────────────────────────

/**
 * Write the collections of a cms.config.ts — works for filesystem and
 * GitHub-backed sites. Only the `collections` array is changed; everything
 * else in the file is preserved verbatim. The original is validated before
 * write and backed up to `<config>.bak`.
 *
 * `config` is kept for signature stability; it is no longer needed to
 * reconstruct top-level fields (they're preserved from the source directly).
 */
export async function writeConfigCollections(
  configPath: string,
  _config: CmsConfig,
  collections: CollectionDef[],
): Promise<void> {
  const gh = parseGitHubPath(configPath);

  if (gh) {
    const token = await getGitHubToken();
    const { content: original, sha } = await readGitHubFile(gh.owner, gh.repo, gh.path, token);
    const updated = replaceCollectionsArray(original, collections);
    assertConfigIntact(original, updated, collections);
    await writeGitHubFile(gh.owner, gh.repo, gh.path, updated, sha, token);
  } else {
    const original = readFileSync(configPath, 'utf-8');
    const updated = replaceCollectionsArray(original, collections);
    assertConfigIntact(original, updated, collections);
    writeFileSync(configPath + '.bak', original, 'utf-8');
    writeFileSync(configPath, updated, 'utf-8');
  }
}
