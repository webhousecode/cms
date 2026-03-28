import { defineConfig, defineCollection, defineBlock, type FieldConfig } from '@webhouse/cms';

export default defineConfig({
  blocks: [
    defineBlock({
      name: 'hero',
      label: 'Hero Section',
      fields: [
        { name: 'tagline', type: 'text', label: 'Tagline', required: true },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'image', type: 'image', label: 'Background Image' },
        { name: 'ctas', type: 'array', label: 'Buttons', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
        ]},
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'items', type: 'array', label: 'Feature Cards', fields: [
          { name: 'icon', type: 'text', label: 'Icon (emoji)' },
          { name: 'title', type: 'text', label: 'Title' },
          { name: 'description', type: 'textarea', label: 'Description' },
        ]},
      ],
    }),
    defineBlock({
      name: 'cta',
      label: 'Call to Action',
      fields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'buttonText', type: 'text', label: 'Button Text' },
        { name: 'buttonUrl', type: 'text', label: 'Button URL' },
      ],
    }),
  ],

  collections: [
    defineCollection({
      name: 'global',
      label: 'Global Settings',
      fields: [
        { name: 'siteTitle', type: 'text', label: 'Site Title', required: true },
        { name: 'siteDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'navLinks', type: 'array', label: 'Navigation', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
        ]},
        { name: 'footerText', type: 'text', label: 'Footer Text' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'sections', type: 'blocks', label: 'Sections', blocks: ['hero', 'features', 'cta'] },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'location', type: 'map' as FieldConfig['type'], label: 'Location' },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        { name: 'author', type: 'text', label: 'Author' },
        { name: 'coverImage', type: 'image', label: 'Cover Image' },
        { name: 'tags', type: 'tags', label: 'Tags' },
      ],
    }),
  ],

  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },
  build: {
    outDir: '.next',
    baseUrl: '/',
  },
});
