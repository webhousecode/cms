import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'globals',
      label: 'Site Content',
      fields: [
        { name: 'siteName', type: 'text', required: true, label: 'Site Name' },
        { name: 'role', type: 'text', label: 'Role / Tagline' },
        { name: 'philosophy', type: 'textarea', label: 'Philosophy Quote (blockquote)' },
        { name: 'introText', type: 'textarea', label: 'Intro Paragraph' },
        { name: 'contactCta', type: 'text', label: 'Contact Button Text' },
        { name: 'contactNote', type: 'text', label: 'Contact Note' },
        {
          name: 'philosophyItems',
          type: 'array',
          label: 'Philosophy Sidebar Items',
          fields: [{ name: 'text', type: 'text' }],
        },
        { name: 'blogHeading', type: 'text', label: 'Blog Section Heading' },
        { name: 'blogDescription', type: 'textarea', label: 'Blog Description' },
        { name: 'blogCta', type: 'text', label: 'Blog CTA Text' },
        { name: 'projectsHeading', type: 'text', label: 'Projects Section Heading' },
        { name: 'projectsDescription', type: 'textarea', label: 'Projects Description' },
        { name: 'projectsCta', type: 'text', label: 'Projects CTA Text' },
        {
          name: 'contactItems',
          type: 'array',
          label: 'Contact Links',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'value', type: 'text' },
            { name: 'href', type: 'text' },
          ],
        },
        { name: 'footerCopyright', type: 'text', label: 'Footer Copyright' },
        {
          name: 'footerLinks',
          type: 'array',
          label: 'Footer Links',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
          ],
        },
        { name: 'instagramUrl', type: 'text', label: 'Instagram URL' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'bio', type: 'textarea', label: 'Bio Text' },
        {
          name: 'skillCategories',
          type: 'array',
          label: 'Skill Categories',
          fields: [
            { name: 'name', type: 'text', label: 'Category Name' },
            { name: 'skills', type: 'tags', label: 'Skills' },
          ],
        },
        {
          name: 'timeline',
          type: 'array',
          label: 'Timeline',
          fields: [
            { name: 'year', type: 'text' },
            { name: 'description', type: 'text' },
          ],
        },
        {
          name: 'aboutLinks',
          type: 'array',
          label: 'Links',
          fields: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
          ],
        },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'date', type: 'date' },
        {
          name: 'category',
          type: 'select',
          options: [
            { label: 'Development', value: 'development' },
            { label: 'Design', value: 'design' },
            { label: 'DevOps', value: 'devops' },
            { label: 'Security', value: 'security' },
            { label: 'AI', value: 'ai' },
            { label: 'Open Source', value: 'open-source' },
          ],
        },
        { name: 'tags', type: 'tags' },
      ],
    }),
    defineCollection({
      name: 'projects',
      label: 'Projects',
      urlPrefix: '/projects',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'Active', value: 'active' },
            { label: 'Featured', value: 'featured' },
            { label: 'Archived', value: 'archived' },
          ],
        },
        { name: 'icon', type: 'text', label: 'Icon (emoji)' },
        { name: 'techTags', type: 'tags', label: 'Tech Tags' },
        { name: 'linkLabel', type: 'text', label: 'Link Label (e.g. GitHub →)' },
        { name: 'linkUrl', type: 'text', label: 'Link URL' },
        { name: 'sortOrder', type: 'number' },
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
