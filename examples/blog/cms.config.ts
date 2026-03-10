import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        {
          name: 'author',
          type: 'text',
          label: 'Author',
          ai: { hint: 'Full name of the author' },
        },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext' },
      ],
    }),
  ],
  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },
  build: {
    outDir: 'dist',
    baseUrl: '/',
  },
  api: { port: 3000 },
});
