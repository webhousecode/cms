import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'projects',
      label: 'Projects',
      urlPrefix: '/projects/',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'category', type: 'text', label: 'Category' },
        { name: 'year', type: 'text', label: 'Year' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'coverImage', type: 'image', label: 'Cover Image' },
        {
          name: 'images',
          type: 'image-gallery',
          label: 'Project Images',
        },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', label: 'Page Title', required: true },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'heroImage', type: 'image', label: 'Hero Image' },
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
});
