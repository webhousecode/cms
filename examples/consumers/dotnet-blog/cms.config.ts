/**
 * @webhouse/cms config for the .NET 9 Razor Pages example.
 *
 * This file is used by CMS admin (the visual editor). The .NET runtime never
 * executes this file — it just reads the JSON files in content/ via the
 * WebhouseReader service class.
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
      urlPrefix: '/blog',
      kind: 'page',
      description: 'Blog posts rendered by ASP.NET Core 9 Razor Pages at /blog/{slug}.',
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
