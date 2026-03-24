import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      slug: 'posts',
      urlPrefix: '/posts',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Date' },
        { name: 'tags', type: 'tags', label: 'Tags' },
        { name: 'coverImage', type: 'text', label: 'Cover Image' },
        { name: 'author', type: 'text', label: 'Author' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      slug: 'pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'siteTitle', type: 'text', label: 'Site Title' },
        { name: 'tagline', type: 'text', label: 'Tagline' },
        { name: 'metaDescription', type: 'text', label: 'Meta Description' },
        { name: 'content', type: 'richtext', label: 'Content' },
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
