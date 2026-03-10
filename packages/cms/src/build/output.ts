import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { RenderedPage } from './render.js';

export interface OutputOptions {
  outDir: string;
}

export function writeOutput(pages: RenderedPage[], options: OutputOptions): void {
  const { outDir } = options;

  for (const page of pages) {
    const filePath = join(outDir, page.path);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, page.content, 'utf-8');
  }
}
