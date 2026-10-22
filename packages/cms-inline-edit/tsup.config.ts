import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/server/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
  },
  {
    // F157.20 — one self-contained <script> (global CmsInlineEdit) for pages
    // that cannot import modules, e.g. cardmem's sandboxed mockup iframe.
    entry: { index: 'src/index.ts' },
    format: ['iife'],
    globalName: 'CmsInlineEdit',
    platform: 'browser',
    minify: true,
    sourcemap: false,
    clean: false,
  },
]);
