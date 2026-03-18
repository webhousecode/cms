import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'pages',
      label: 'Pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'content', type: 'richtext' },
      ],
    }),
    defineCollection({
      name: 'projects',
      label: 'Projects',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'category', type: 'text' },
        { name: 'heroImage', type: 'text' },
        { name: 'year', type: 'text' },
        { name: 'description', type: 'textarea' },
        {
          name: 'images',
          type: 'array',
          label: 'Gallery Images',
          fields: [
            { name: 'url', type: 'text' },
            { name: 'alt', type: 'text' },
          ],
        },
      ],
    }),
    defineCollection({
      name: 'news',
      label: 'News',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'date', type: 'date' },
        { name: 'content', type: 'richtext' },
        { name: 'excerpt', type: 'textarea' },
      ],
    }),
  ],
  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },
  build: {
    outDir: 'dist',
  },
});
