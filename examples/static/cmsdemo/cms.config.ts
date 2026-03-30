import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  defaultLocale: 'en',
  locales: ['en', 'da'],

  collections: [
    defineCollection({
      name: 'globals',
      label: 'Site Settings',
      slug: 'globals',
      urlPrefix: '/',
      translatable: true,
      sourceLocale: 'en',
      locales: ['en', 'da'],
      fields: [
        { name: 'siteTitle', type: 'text', label: 'Site Title', required: true },
        { name: 'tagline', type: 'text', label: 'Tagline' },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'heroHeadline', type: 'text', label: 'Hero Headline' },
        { name: 'heroSubline', type: 'textarea', label: 'Hero Subline' },
        { name: 'ctaPrimary', type: 'text', label: 'CTA Primary Text' },
        { name: 'ctaSecondary', type: 'text', label: 'CTA Secondary Text' },
        { name: 'footerText', type: 'text', label: 'Footer Text' },
        { name: 'navItems', type: 'text', label: 'Nav Items (comma-separated)' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      slug: 'pages',
      urlPrefix: '/',
      translatable: true,
      sourceLocale: 'en',
      locales: ['en', 'da'],
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'sections', type: 'blocks', label: 'Sections' },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      slug: 'posts',
      urlPrefix: '/blog',
      translatable: true,
      sourceLocale: 'en',
      locales: ['en', 'da'],
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Date' },
        { name: 'tags', type: 'tags', label: 'Tags' },
        { name: 'author', type: 'text', label: 'Author' },
        { name: 'readTime', type: 'text', label: 'Read Time' },
      ],
    }),
  ],

  blocks: [
    defineBlock({
      name: 'hero',
      label: 'Hero Section',
      fields: [
        { name: 'badge', type: 'text', label: 'Badge Text' },
        { name: 'headline', type: 'text', label: 'Headline' },
        { name: 'subline', type: 'textarea', label: 'Subline' },
        { name: 'terminalCode', type: 'textarea', label: 'Terminal Code' },
        { name: 'ctaPrimary', type: 'text', label: 'Primary CTA' },
        { name: 'ctaSecondary', type: 'text', label: 'Secondary CTA' },
      ],
    }),
    defineBlock({
      name: 'stats',
      label: 'Stats Row',
      fields: [
        { name: 'items', type: 'textarea', label: 'Stats (JSON array: [{value, label}])' },
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'heading', type: 'text', label: 'Section Heading' },
        { name: 'subheading', type: 'text', label: 'Subheading' },
        { name: 'items', type: 'textarea', label: 'Features (JSON array: [{title, description, icon, tag}])' },
      ],
    }),
    defineBlock({
      name: 'cta',
      label: 'Call to Action',
      fields: [
        { name: 'heading', type: 'text', label: 'Heading' },
        { name: 'subheading', type: 'text', label: 'Subheading' },
        { name: 'buttonText', type: 'text', label: 'Button Text' },
        { name: 'buttonUrl', type: 'text', label: 'Button URL' },
        { name: 'secondaryText', type: 'text', label: 'Secondary Button Text' },
        { name: 'secondaryUrl', type: 'text', label: 'Secondary URL' },
      ],
    }),
    defineBlock({
      name: 'text-section',
      label: 'Text Section',
      fields: [
        { name: 'heading', type: 'text', label: 'Heading' },
        { name: 'body', type: 'richtext', label: 'Body' },
        { name: 'variant', type: 'text', label: 'Variant (default, dark, accent)' },
      ],
    }),
    defineBlock({
      name: 'timeline',
      label: 'Timeline',
      fields: [
        { name: 'heading', type: 'text', label: 'Heading' },
        { name: 'items', type: 'textarea', label: 'Timeline items (JSON array: [{year, text}])' },
      ],
    }),
    defineBlock({
      name: 'code-showcase',
      label: 'Code Showcase',
      fields: [
        { name: 'heading', type: 'text', label: 'Heading' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'code', type: 'textarea', label: 'Code Block' },
        { name: 'language', type: 'text', label: 'Language' },
      ],
    }),
    defineBlock({
      name: 'mcp-section',
      label: 'MCP Section',
      fields: [
        { name: 'heading', type: 'text', label: 'Heading' },
        { name: 'subheading', type: 'textarea', label: 'Subheading' },
        { name: 'cards', type: 'textarea', label: 'Cards (JSON: [{title, badge, description, tools}])' },
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
