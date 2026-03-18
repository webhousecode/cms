import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'work',
      label: 'Case Studies',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'client', type: 'text', required: true },
        { name: 'category', type: 'text' },
        { name: 'heroImage', type: 'text' },
        { name: 'excerpt', type: 'textarea' },
        { name: 'description', type: 'textarea' },
        { name: 'year', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'team',
      label: 'Team',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'photo', type: 'text' },
        { name: 'bio', type: 'textarea' },
      ],
    }),
    defineCollection({
      name: 'services',
      label: 'Services',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        { name: 'icon', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea' },
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
  },
});
