import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'globals',
      label: 'Site Content',
      fields: [
        { name: 'studioName', type: 'text', required: true, label: 'Studio Name' },
        { name: 'footerLocation', type: 'text', label: 'Footer Location' },
        { name: 'footerEmail', type: 'text', label: 'Footer Email' },
        { name: 'copyright', type: 'text', label: 'Copyright Text' },
        { name: 'instagramLabel', type: 'text', label: 'Instagram Link Label' },
        { name: 'instagramUrl', type: 'text', label: 'Instagram URL' },
        { name: 'builtWithLabel', type: 'text', label: 'Built With Label' },
        { name: 'builtWithUrl', type: 'text', label: 'Built With URL' },
        { name: 'builtWithName', type: 'text', label: 'Built With Name' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'heroHeading', type: 'text', label: 'Hero Heading' },
        { name: 'tagline', type: 'textarea', label: 'Tagline' },
        { name: 'heading', type: 'text', label: 'Page Heading' },
        { name: 'selectedWorkLabel', type: 'text', label: 'Selected Work Label' },
        { name: 'viewAllLabel', type: 'text', label: 'View All Label' },
        { name: 'content', type: 'richtext' },
      ],
    }),
    defineCollection({
      name: 'projects',
      label: 'Projects',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'category', type: 'text' },
        { name: 'heroImage', type: 'image' },
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
