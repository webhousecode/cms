/**
 * @webhouse/cms config for the Hugo example.
 *
 * Hugo expects markdown files in content/posts/. We sync the JSON to markdown
 * via scripts/sync-content.go before each build. CMS admin writes the JSON,
 * the sync script regenerates the markdown.
 */
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  defaultLocale: 'en',
  locales: ['en', 'da'],

  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      slug: 'posts',
      urlPrefix: '/posts',
      kind: 'page',
      description: 'Blog posts synced to Hugo markdown via scripts/sync-content.go',
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
    filesystem: { contentDir: '_webhouse-content' },
  },
});
