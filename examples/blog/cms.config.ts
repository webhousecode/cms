import { defineConfig, defineCollection } from '@webhouse/cms';

/**
 * Simple Blog — F127 reference / test bed
 *
 * This config intentionally exercises ALL FIVE collection kinds so it can
 * serve as the canonical test site for chat behavior, MCP tools, and the
 * AI Builder Guide. Don't strip collections from this file just because
 * a typical "blog" wouldn't have them — they're here on purpose.
 *
 * Kinds covered:
 *   page    → posts, pages
 *   data    → team, services, testimonials
 *   snippet → snippets
 *   form    → contact-submissions
 *   global  → globals
 */
export default defineConfig({
  collections: [
    // ── PAGE kind ────────────────────────────────────────────────
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      kind: 'page',
      description: 'Long-form blog articles. Each post has its own URL and appears in the RSS feed.',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        {
          name: 'author',
          type: 'text',
          label: 'Author',
          ai: { hint: 'Full name of the author' },
        },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      kind: 'page',
      description: 'Top-level marketing pages (home, about, etc.). Each page has its own URL under the site root.',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext' },
      ],
    }),

    // ── DATA kind ────────────────────────────────────────────────
    defineCollection({
      name: 'team',
      label: 'Team Members',
      kind: 'data',
      description: 'Team members. Referenced by posts.author field. Rendered as a grid on /about and as bylines on blog posts.',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'bio', type: 'textarea' },
        { name: 'photo', type: 'image' },
        { name: 'email', type: 'text' },
        { name: 'sortOrder', type: 'number' },
      ],
    }),
    defineCollection({
      name: 'services',
      label: 'Services',
      kind: 'data',
      description: 'Services offered. Looped on the /services page as cards. Each service has a title, description, and price.',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        { name: 'price', type: 'text' },
        { name: 'icon', type: 'text', label: 'Icon (emoji)' },
        { name: 'sortOrder', type: 'number' },
      ],
    }),
    defineCollection({
      name: 'testimonials',
      label: 'Testimonials',
      kind: 'data',
      description: 'Customer testimonials. Rendered in a carousel on the homepage and on /about. Created by editors based on real customer feedback.',
      fields: [
        { name: 'quote', type: 'textarea', required: true },
        { name: 'author', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'company', type: 'text' },
        { name: 'rating', type: 'number' },
      ],
    }),

    // ── SNIPPET kind ─────────────────────────────────────────────
    defineCollection({
      name: 'snippets',
      label: 'Snippets',
      kind: 'snippet',
      description: 'Reusable text fragments embedded in posts via `{{snippet:slug}}`. Used for boilerplate disclaimers, CTAs, and author bios.',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext', required: true },
      ],
    }),

    // ── FORM kind ────────────────────────────────────────────────
    defineCollection({
      name: 'contact-submissions',
      label: 'Contact Form',
      kind: 'form',
      description: 'Submissions from the /contact form. Created by site visitors via frontend form — never by AI or editors. Reviewed by sales team.',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'text', required: true },
        { name: 'subject', type: 'text' },
        { name: 'message', type: 'textarea', required: true },
        { name: 'submittedAt', type: 'date' },
      ],
    }),

    // ── GLOBAL kind ──────────────────────────────────────────────
    defineCollection({
      name: 'globals',
      label: 'Site Settings',
      kind: 'global',
      description: 'Site-wide configuration: site title, footer text, social links, analytics ID. Single record only.',
      fields: [
        { name: 'siteTitle', type: 'text', required: true },
        { name: 'siteDescription', type: 'textarea' },
        { name: 'footerText', type: 'text' },
        { name: 'twitterHandle', type: 'text' },
        { name: 'githubUrl', type: 'text' },
        { name: 'analyticsId', type: 'text' },
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
  api: { port: 3000 },
});
