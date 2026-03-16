import { readFileSync, writeFileSync } from 'node:fs';
import type { CmsConfig, FieldConfig } from '@webhouse/cms';

export interface CollectionDef {
  name: string;
  label?: string;
  urlPrefix?: string;
  fields: FieldConfig[];
}

function serializeField(f: FieldConfig): string {
  const props: string[] = [];
  props.push(`name: ${JSON.stringify(f.name)}`);
  props.push(`type: ${JSON.stringify(f.type)}`);
  if (f.label) props.push(`label: ${JSON.stringify(f.label)}`);
  if (f.required) props.push(`required: true`);
  if (f.options?.length) {
    const opts = f.options.map(o => `{ label: ${JSON.stringify(o.label)}, value: ${JSON.stringify(o.value)} }`).join(', ');
    props.push(`options: [${opts}]`);
  }
  if (f.collection) props.push(`collection: ${JSON.stringify(f.collection)}`);
  return `        { ${props.join(', ')} }`;
}

function serializeCollection(col: CollectionDef): string {
  const lines: string[] = [`    defineCollection({`];
  lines.push(`      name: ${JSON.stringify(col.name)},`);
  if (col.label) lines.push(`      label: ${JSON.stringify(col.label)},`);
  if (col.urlPrefix) lines.push(`      urlPrefix: ${JSON.stringify(col.urlPrefix)},`);
  lines.push(`      fields: [`);
  for (const f of col.fields) {
    lines.push(serializeField(f) + ',');
  }
  lines.push(`      ],`);
  lines.push(`    })`);
  return lines.join('\n');
}

function buildConfigContent(original: string, config: CmsConfig, collections: CollectionDef[]): string {
  const autolinksSection = config.autolinks?.length
    ? `  autolinks: ${JSON.stringify(config.autolinks, null, 2).replace(/\n/g, '\n  ')},\n`
    : '';

  let storageSection = '';
  if (config.storage) {
    const storageObj = config.storage as Record<string, unknown>;
    const adapterName = config.storage.adapter;
    if (adapterName) {
      const adapterConfig = storageObj[adapterName];
      storageSection = `  storage: {\n    adapter: ${JSON.stringify(adapterName)},\n    ${adapterName}: ${JSON.stringify(adapterConfig, null, 4).replace(/\n/g, '\n    ')},\n  },`;
    } else {
      storageSection = `  storage: ${JSON.stringify(config.storage, null, 2).replace(/\n/g, '\n  ')},`;
    }
  }

  // Preserve blocks section from original file if present
  let blocksSection = '';
  const blocksMatch = original.match(/(  blocks:\s*\[[\s\S]*?\n  \]),?/);
  if (blocksMatch) {
    blocksSection = blocksMatch[1].replace(/\],?\s*$/, '],');
  }

  const usesDefineBlock = original.includes('defineBlock');
  const importLine = usesDefineBlock
    ? `import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';`
    : `import { defineConfig, defineCollection } from '@webhouse/cms';`;

  return [
    importLine,
    ``,
    `export default defineConfig({`,
    ...(blocksSection ? [blocksSection] : []),
    ...(autolinksSection ? [autolinksSection.trimEnd()] : []),
    `  collections: [`,
    collections.map(serializeCollection).join(',\n'),
    `  ],`,
    ...(storageSection ? [storageSection] : []),
    `});`,
    ``,
  ].join('\n');
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

/** Write config — works for both local filesystem and GitHub-backed sites */
export async function writeConfigCollections(
  configPath: string,
  config: CmsConfig,
  collections: CollectionDef[],
): Promise<void> {
  const gh = parseGitHubPath(configPath);

  if (gh) {
    // GitHub-backed site — read/write via API
    const token = await getGitHubToken();
    const { content: original, sha } = await readGitHubFile(gh.owner, gh.repo, gh.path, token);
    const newContent = buildConfigContent(original, config, collections);
    await writeGitHubFile(gh.owner, gh.repo, gh.path, newContent, sha, token);
  } else {
    // Local filesystem
    const original = readFileSync(configPath, 'utf-8');
    writeFileSync(configPath + '.bak', original, 'utf-8');
    const newContent = buildConfigContent(original, config, collections);
    writeFileSync(configPath, newContent, 'utf-8');
  }
}
