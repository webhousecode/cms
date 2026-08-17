import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Without this alias no test can import a module that uses `@/…`, which is
  // most of src/lib. That is why the Mistral model guard could only ever be
  // tested indirectly — resolve-chat-model.ts was written dependency-free
  // specifically to dodge it, and the untested call sites kept the bug.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/lib/__tests__/**/*.test.ts'],
  },
});
