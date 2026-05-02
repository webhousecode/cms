import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/collections/index.ts',
    'src/stripe/index.ts',
    'src/cart/index.ts',
    'src/checkout/index.ts',
    'src/webhooks/index.ts',
    'src/storefront/index.ts',
    'src/islands/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
