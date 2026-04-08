<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Complete Config Example

## Complete cms.config.ts Example

A realistic config with multiple collections, blocks, nested arrays, relations, and i18n:

```typescript
import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  defaultLocale: 'en',
  locales: ['en', 'da'],

  blocks: [
    defineBlock({
      name: 'hero',
      label: 'Hero Section',
      fields: [
        { name: 'badge', type: 'text', label: 'Badge Text' },
        { name: 'tagline', type: 'text', label: 'Tagline', required: true },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'image', type: 'image', label: 'Background Image' },
        { name: 'ctas', type: 'array', label: 'Call-to-Actions', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
          { name: 'variant', type: 'select', options: [
            { label: 'Solid', value: 'solid' },
            { label: 'Outline', value: 'outline' },
          ]},
        ]},
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'description', type: 'textarea', label: 'Section Description' },
        { name: 'items', type: 'array', label: 'Feature Cards', fields: [
          { name: 'icon', type: 'text', label: 'Icon' },
          { name: 'title', type: 'text', label: 'Title' },
          { name: 'description', type: 'textarea', label: 'Description' },
        ]},
      ],
    }),
    defineBlock({
      name: 'notice',
      label: 'Notice / Callout',
      fields: [
        { name: 'text', type: 'textarea', label: 'Text' },
        { name: 'variant', type: 'select', label: 'Variant', options: [
          { label: 'Info', value: 'info' },
          { label: 'Warning', value: 'warning' },
          { label: 'Tip', value: 'tip' },
        ]},
      ],
    }),
    defineBlock({
      name: 'carousel',
      label: 'Image Carousel',
      fields: [
        { name: 'images', type: 'image-gallery', label: 'Images' },
        { name: 'caption', type: 'text', label: 'Caption' },
      ],
    }),
  ],

  autolinks: [
    { term: 'TypeScript', href: '/blog/typescript', title: 'TypeScript articles' },
  ],

  collections: [
    defineCollection({
      name: 'global',
      label: 'Global Settings',
      kind: 'global',
      description: 'Site-wide configuration: title, meta description, navigation, footer. Single record.',
      fields: [
        { name: 'siteTitle', type: 'text', label: 'Site Title' },
        { name: 'siteDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'navLinks', type: 'array', label: 'Navigation', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
          { name: 'dropdown', type: 'object', label: 'Dropdown', fields: [
            { name: 'type', type: 'select', options: [
              { label: 'List', value: 'list' },
              { label: 'Columns', value: 'columns' },
            ]},
            { name: 'sections', type: 'array', label: 'Sections', fields: [
              { name: 'heading', type: 'text' },
              { name: 'links', type: 'array', fields: [
                { name: 'label', type: 'text' },
                { name: 'href', type: 'text' },
                { name: 'external', type: 'boolean' },
              ]},
            ]},
          ]},
        ]},
        { name: 'footerEmail', type: 'text', label: 'Footer Email' },
      ],
    }),

    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      kind: 'page',
      description: 'Top-level marketing pages built from blocks. Each page has its own URL under the site root.',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'sections', type: 'blocks', label: 'Sections',
          blocks: ['hero', 'features', 'notice', 'carousel'] },
      ],
    }),

    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      kind: 'page',
      description: 'Long-form blog articles. Each post has its own URL under /blog and appears in the RSS feed.',
      sourceLocale: 'en',
      locales: ['en', 'da'],
      fields: [
        { name: 'title', type: 'text', required: true,
          ai: { hint: 'Concise, descriptive title under 70 characters', maxLength: 70 } },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt',
          ai: { hint: 'One-paragraph summary', maxLength: 200 } },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        { name: 'author', type: 'relation', collection: 'team', label: 'Author' },
        { name: 'category', type: 'select', options: [
          { label: 'Engineering', value: 'engineering' },
          { label: 'Design', value: 'design' },
          { label: 'Company', value: 'company' },
        ]},
        { name: 'tags', type: 'tags', label: 'Tags' },
        { name: 'coverImage', type: 'image', label: 'Cover Image' },
        { name: 'relatedPosts', type: 'relation', collection: 'posts', multiple: true,
          label: 'Related Posts' },
      ],
    }),

    defineCollection({
      name: 'team',
      label: 'Team Members',
      kind: 'data',
      description: 'Team members. Referenced by posts.author field. Rendered as a grid on /about and as bylines on posts.',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'bio', type: 'textarea' },
        { name: 'photo', type: 'image' },
        { name: 'sortOrder', type: 'number' },
      ],
    }),

    defineCollection({
      name: 'work',
      label: 'Case Studies',
      urlPrefix: '/work',
      kind: 'page',
      description: 'Case studies showing client projects. Each case study has its own URL under /work.',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'client', type: 'text', required: true },
        { name: 'category', type: 'select', options: [
          { label: 'Web', value: 'web' },
          { label: 'Mobile', value: 'mobile' },
          { label: 'AI', value: 'ai' },
        ]},
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'year', type: 'text' },
        { name: 'tech', type: 'tags', label: 'Tech Stack' },
        { name: 'featured', type: 'boolean' },
        { name: 'gallery', type: 'image-gallery', label: 'Project Gallery' },
        { name: 'demoVideo', type: 'video', label: 'Demo Video' },
      ],
    }),
  ],

  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },

  build: {
    outDir: 'dist',
    baseUrl: 'https://example.com',
  },

  api: { port: 3000 },
});
```
