import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'http://localhost:4321',
  output: 'server',
  server: {
    host: true,
    port: 4321,
  },
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
