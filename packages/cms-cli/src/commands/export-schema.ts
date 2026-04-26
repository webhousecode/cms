/**
 * F125 Phase 1 — `npx cms export-schema` command
 *
 * Reads cms.config.ts and outputs a JSON Schema document so non-TypeScript
 * runtimes can introspect the content model.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../utils/config-loader.js';
import { logger } from '../utils/logger.js';

export interface ExportSchemaOptions {
  out?: string;
  baseUrl?: string;
  pretty?: boolean;
  includeBlocks?: boolean;
  title?: string;
  cwd?: string;
}

export async function exportSchemaCommand(options: ExportSchemaOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  const { toJsonSchema } = await import('@webhouse/cms');

  // exactOptionalPropertyTypes: only spread defined values so we don't pass
  // explicit `undefined` for optional fields.
  const schema = toJsonSchema(config, {
    ...(options.baseUrl !== undefined && { baseUrl: options.baseUrl }),
    ...(options.title !== undefined && { title: options.title }),
    includeBlocks: options.includeBlocks ?? true,
  });

  const indent = options.pretty === false ? 0 : 2;
  const output = JSON.stringify(schema, null, indent);

  if (options.out) {
    const outPath = resolve(cwd, options.out);
    writeFileSync(outPath, output, 'utf-8');
    const collectionCount = Object.keys(schema.collections).length;
    const blockCount = schema.blocks ? Object.keys(schema.blocks).length : 0;
    logger.success(`Schema exported to ${outPath}`);
    logger.log(`  Collections: ${collectionCount}`);
    if (blockCount > 0) logger.log(`  Blocks: ${blockCount}`);
    logger.log(`  Size: ${(output.length / 1024).toFixed(1)} KB`);
  } else {
    process.stdout.write(output);
    if (process.stdout.isTTY) process.stdout.write('\n');
  }
}
