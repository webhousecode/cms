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

export function writeConfigCollections(
  configPath: string,
  config: CmsConfig,
  collections: CollectionDef[],
): void {
  // Backup original first
  const original = readFileSync(configPath, 'utf-8');
  writeFileSync(configPath + '.bak', original, 'utf-8');

  const autolinksSection = config.autolinks?.length
    ? `  autolinks: ${JSON.stringify(config.autolinks, null, 2).replace(/\n/g, '\n  ')},\n`
    : '';

  // Serialize storage — handle filesystem adapter
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

  const content = [
    `import { defineConfig, defineCollection } from '@webhouse/cms';`,
    ``,
    `export default defineConfig({`,
    ...(autolinksSection ? [autolinksSection.trimEnd()] : []),
    `  collections: [`,
    collections.map(serializeCollection).join(',\n'),
    `  ],`,
    ...(storageSection ? [storageSection] : []),
    `});`,
    ``,
  ].join('\n');

  writeFileSync(configPath, content, 'utf-8');
}
