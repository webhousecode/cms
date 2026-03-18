import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'work',
      label: 'Case Studies',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'client', type: 'text', required: true },
        { name: 'category', type: 'text' },
        { name: 'heroImage', type: 'image' },
        { name: 'excerpt', type: 'textarea' },
        { name: 'description', type: 'textarea' },
        { name: 'year', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'team',
      label: 'Team',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'photo', type: 'image' },
        { name: 'bio', type: 'textarea' },
      ],
    }),
    defineCollection({
      name: 'services',
      label: 'Services',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        { name: 'icon', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea' },
        // Hero section
        { name: 'heroLabel', type: 'text', label: 'Hero Label' },
        { name: 'heroHeadingBefore', type: 'text', label: 'Hero Heading (before highlight)' },
        { name: 'heroHeadingHighlight', type: 'text', label: 'Hero Heading (highlighted text)' },
        { name: 'heroHeadingAfter', type: 'text', label: 'Hero Heading (after highlight)' },
        { name: 'heroSubtitle', type: 'textarea', label: 'Hero Subtitle' },
        { name: 'heroIntro', type: 'textarea', label: 'Hero Intro' },
        { name: 'heroCta', type: 'text', label: 'Hero CTA Text' },
        { name: 'heroCtaUrl', type: 'text', label: 'Hero CTA URL' },
        // Services section
        { name: 'servicesLabel', type: 'text', label: 'Services Label' },
        { name: 'servicesHeading', type: 'text', label: 'Services Heading' },
        // Featured work section
        { name: 'featuredWorkLabel', type: 'text', label: 'Featured Work Label' },
        { name: 'featuredWorkHeading', type: 'text', label: 'Featured Work Heading' },
        { name: 'featuredWorkViewAllText', type: 'text', label: 'Featured Work View All Text' },
        // Team section
        { name: 'teamLabel', type: 'text', label: 'Team Label' },
        { name: 'teamHeading', type: 'text', label: 'Team Heading' },
        // Team section (about page)
        { name: 'teamSectionLabel', type: 'text', label: 'Team Section Label' },
        { name: 'teamSectionHeading', type: 'text', label: 'Team Section Heading' },
        // CTA section
        { name: 'ctaHeading', type: 'text', label: 'CTA Heading' },
        { name: 'ctaSubtitle', type: 'textarea', label: 'CTA Subtitle' },
        { name: 'ctaButtonText', type: 'text', label: 'CTA Button Text' },
        { name: 'ctaButtonUrl', type: 'text', label: 'CTA Button URL' },
        // Values (about page)
        { name: 'values', type: 'array', label: 'Values', fields: [
          { name: 'title', type: 'text' },
          { name: 'description', type: 'textarea' },
        ]},
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
