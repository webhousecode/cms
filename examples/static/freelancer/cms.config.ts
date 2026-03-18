import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'services',
      label: 'Services',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        {
          name: 'features',
          type: 'array',
          fields: [{ name: 'text', type: 'text' }],
        },
        { name: 'price', type: 'text' },
        { name: 'popular', type: 'boolean' },
      ],
    }),
    defineCollection({
      name: 'testimonials',
      label: 'Testimonials',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'company', type: 'text' },
        { name: 'quote', type: 'textarea' },
        { name: 'photo', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'date', type: 'date' },
        { name: 'coverImage', type: 'text' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea' },
        // Site identity (home page)
        { name: 'name', type: 'text' },
        { name: 'jobTitle', type: 'text' },
        // Hero section (home page)
        { name: 'heroTagline', type: 'textarea' },
        { name: 'heroCta1', type: 'text' },
        { name: 'heroCta2', type: 'text' },
        // Trust bar (home page)
        { name: 'trustLabel', type: 'text' },
        {
          name: 'trustCompanies',
          type: 'array',
          fields: [{ name: 'value', type: 'text' }],
        },
        // Home section headings
        { name: 'servicesLabel', type: 'text' },
        { name: 'servicesTitle', type: 'text' },
        { name: 'servicesDesc', type: 'textarea' },
        { name: 'testimonialsLabel', type: 'text' },
        { name: 'testimonialsTitle', type: 'text' },
        { name: 'testimonialsDesc', type: 'textarea' },
        { name: 'blogLabel', type: 'text' },
        { name: 'blogTitle', type: 'text' },
        { name: 'blogDesc', type: 'textarea' },
        // CTA sections
        { name: 'ctaTitle', type: 'text' },
        { name: 'ctaDesc', type: 'textarea' },
        { name: 'ctaButton', type: 'text' },
        // Footer (home page)
        { name: 'footerDesc', type: 'textarea' },
        {
          name: 'footerColumns',
          type: 'array',
          fields: [
            { name: 'heading', type: 'text' },
            {
              name: 'links',
              type: 'array',
              fields: [
                { name: 'label', type: 'text' },
                { name: 'href', type: 'text' },
              ],
            },
          ],
        },
        { name: 'navCta', type: 'text' },
        {
          name: 'navLinks',
          type: 'array',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
            { name: 'key', type: 'text' },
          ],
        },
        {
          name: 'socialLinks',
          type: 'array',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
          ],
        },
        { name: 'copyrightSuffix', type: 'text' },
        // Services page
        { name: 'pricingLabel', type: 'text' },
        { name: 'pricingTitle', type: 'text' },
        { name: 'pricingDesc', type: 'textarea' },
        { name: 'popularBadge', type: 'text' },
        { name: 'cardButton', type: 'text' },
        // Contact page
        { name: 'sectionLabel', type: 'text' },
        { name: 'heading', type: 'text' },
        { name: 'description', type: 'textarea' },
        {
          name: 'contactDetails',
          type: 'array',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'value', type: 'text' },
            { name: 'icon', type: 'text' },
          ],
        },
        {
          name: 'formFields',
          type: 'array',
          fields: [
            { name: 'id', type: 'text' },
            { name: 'label', type: 'text' },
            { name: 'type', type: 'text' },
            { name: 'placeholder', type: 'text' },
            { name: 'row', type: 'number' },
          ],
        },
        { name: 'submitButton', type: 'text' },
        // Blog page
        { name: 'listingLabel', type: 'text' },
        { name: 'listingTitle', type: 'text' },
        { name: 'listingDesc', type: 'textarea' },
        { name: 'postCtaTitle', type: 'text' },
        { name: 'postCtaDesc', type: 'textarea' },
        { name: 'postCtaButton', type: 'text' },
        { name: 'backToList', type: 'text' },
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
