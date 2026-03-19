import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'settings',
      label: 'Settings',
      fields: [
        { name: 'siteName', type: 'text', required: true, label: 'Site Name' },
        { name: 'tagline', type: 'textarea', label: 'Tagline' },
        { name: 'heroHeading', type: 'text', label: 'Hero Heading' },
        { name: 'heroSubheading', type: 'text', label: 'Hero Subheading' },
        { name: 'heroCta', type: 'text', label: 'Hero CTA Text' },
        { name: 'heroCtaUrl', type: 'text', label: 'Hero CTA URL' },
        { name: 'heroImage', type: 'image', label: 'Hero Image' },
        { name: 'brandStoryHeading', type: 'text', label: 'Brand Story Heading' },
        { name: 'brandStoryText', type: 'textarea', label: 'Brand Story Text' },
        { name: 'newsletterHeading', type: 'text', label: 'Newsletter Heading' },
        { name: 'newsletterSubtext', type: 'textarea', label: 'Newsletter Subtext' },
        { name: 'footerText', type: 'textarea', label: 'Footer Text' },
        { name: 'instagramUrl', type: 'text', label: 'Instagram URL' },
        { name: 'twitterUrl', type: 'text', label: 'Twitter / X URL' },
        { name: 'email', type: 'text', label: 'Contact Email' },
        { name: 'galleryImages', type: 'image-gallery', label: 'Editorial Gallery' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
      ],
    }),
    defineCollection({
      name: 'products',
      label: 'Products',
      urlPrefix: '/shop',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'price', type: 'number', label: 'Price' },
        { name: 'description', type: 'textarea', label: 'Description' },
        {
          name: 'category',
          type: 'select',
          label: 'Category',
          options: [
            { label: 'Dresses', value: 'dresses' },
            { label: 'Tops', value: 'tops' },
            { label: 'Bottoms', value: 'bottoms' },
            { label: 'Outerwear', value: 'outerwear' },
            { label: 'Accessories', value: 'accessories' },
          ],
        },
        { name: 'heroImage', type: 'image', label: 'Hero Image' },
        { name: 'images', type: 'image-gallery', label: 'Gallery Images' },
        { name: 'sizes', type: 'tags', label: 'Available Sizes' },
        { name: 'color', type: 'text', label: 'Color' },
        { name: 'material', type: 'text', label: 'Material' },
        { name: 'featured', type: 'boolean', label: 'Featured' },
        { name: 'sortOrder', type: 'number', label: 'Sort Order' },
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
