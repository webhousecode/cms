import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  noExternal: ['picocolors', 'citty'],
  external: ['@webhouse/cms', '@webhouse/cms-ai', '@hono/node-server', 'better-sqlite3'],
});
