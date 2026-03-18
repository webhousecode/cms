import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'services',
      label: 'Services',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        {
          name: 'features',
          type: 'array',
          fields: [{ name: 'text', type: 'text' }],
        },
        { name: 'price', type: 'text' },
        { name: 'popular', type: 'boolean' },
      ],
    }),
    defineCollection({
      name: 'testimonials',
      label: 'Testimonials',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'company', type: 'text' },
        { name: 'quote', type: 'textarea' },
        { name: 'photo', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'date', type: 'date' },
        { name: 'coverImage', type: 'text' },
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
