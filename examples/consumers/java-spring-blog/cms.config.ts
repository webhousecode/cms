/**
 * @webhouse/cms config for the Java Spring Boot example.
 *
 * This file is used by CMS admin (the visual editor) to know what fields each
 * collection has. The Spring Boot runtime never executes this file — it just
 * reads the JSON files in content/ via WebhouseReader.java.
 *
 * In a future Phase 5 of F125, this could be replaced by cms.config.json
 * to remove the TypeScript dependency entirely.
 */
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  defaultLocale: 'en',
  locales: ['en', 'da'],

  collections: [
    defineCollection({
      name: 'globals',
      label: 'Globals',
      slug: 'globals',
      kind: 'global',
      description: 'Site-wide settings rendered in the layout — brand text, footer, etc.',
      previewable: false,
      fields: [
        { name: 'brandPrefix', type: 'text', label: 'Brand prefix', required: true },
        { name: 'brandSuffix', type: 'text', label: 'Brand suffix', required: true },
        { name: 'footerText', type: 'text', label: 'Footer text' },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      slug: 'posts',
      urlPrefix: '/blog',
      kind: 'page',
      description: 'Blog posts rendered by Spring Boot at /blog/{slug}.',
      translatable: true,
      sourceLocale: 'en',
      locales: ['en', 'da'],
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Date' },
        { name: 'author', type: 'text', label: 'Author' },
        { name: 'tags', type: 'tags', label: 'Tags' },
      ],
    }),
  ],

  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },
});
