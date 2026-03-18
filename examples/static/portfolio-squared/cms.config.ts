import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'settings',
      label: 'Site Settings',
      fields: [
        { name: 'siteName', type: 'text', label: 'Site Name', required: true },
        { name: 'email', type: 'text', label: 'Email' },
        { name: 'footerText', type: 'text', label: 'Footer Text' },
        {
          name: 'socialLinks',
          type: 'array',
          label: 'Social Links',
          fields: [
            { name: 'label', type: 'text', label: 'Label' },
            { name: 'url', type: 'text', label: 'URL' },
          ],
        },
        {
          name: 'navLinks',
          type: 'array',
          label: 'Navigation Links',
          fields: [
            { name: 'label', type: 'text', label: 'Label' },
            { name: 'href', type: 'text', label: 'URL' },
            { name: 'key', type: 'text', label: 'Key (for active state)' },
          ],
        },
      ],
    }),
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
        { name: 'heading', type: 'text', label: 'Heading' },
        { name: 'subtitle', type: 'textarea', label: 'Subtitle' },
        { name: 'content', type: 'richtext', label: 'Content' },
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
