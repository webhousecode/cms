import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', label: 'Page Title', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        {
          name: 'sections',
          type: 'blocks',
          label: 'Sections',
          blocks: ['hero', 'stats', 'features', 'architecture', 'mcp', 'cta'],
        },
      ],
    }),
  ],
  blocks: [
    defineBlock({
      name: 'hero',
      label: 'Hero',
      fields: [
        { name: 'badge', type: 'text', label: 'Badge Text' },
        { name: 'tagline', type: 'text', label: 'Tagline' },
        { name: 'primaryCta', type: 'text', label: 'Primary CTA Text' },
        { name: 'primaryCtaUrl', type: 'text', label: 'Primary CTA URL' },
        { name: 'secondaryCta', type: 'text', label: 'Secondary CTA Text' },
        { name: 'secondaryCtaUrl', type: 'text', label: 'Secondary CTA URL' },
        {
          name: 'terminal',
          type: 'array',
          label: 'Terminal Lines',
          fields: [
            { name: 'type', type: 'select', options: [
              { label: 'Command', value: 'cmd' },
              { label: 'Output', value: 'output' },
              { label: 'Success', value: 'success' },
            ]},
            { name: 'text', type: 'text' },
          ],
        },
      ],
    }),
    defineBlock({
      name: 'stats',
      label: 'Stats Bar',
      fields: [
        {
          name: 'items',
          type: 'array',
          label: 'Stats',
          fields: [
            { name: 'value', type: 'text', label: 'Value' },
            { name: 'label', type: 'text', label: 'Label' },
          ],
        },
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'label', type: 'text', label: 'Section Label' },
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'description', type: 'textarea', label: 'Section Description' },
        {
          name: 'items',
          type: 'array',
          label: 'Feature Cards',
          fields: [
            { name: 'icon', type: 'text', label: 'Icon (emoji)' },
            { name: 'title', type: 'text', label: 'Title' },
            { name: 'description', type: 'textarea', label: 'Description' },
            { name: 'tag', type: 'text', label: 'Tag' },
          ],
        },
      ],
    }),
    defineBlock({
      name: 'architecture',
      label: 'Architecture Diagram',
      fields: [
        { name: 'label', type: 'text', label: 'Section Label' },
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'description', type: 'textarea', label: 'Section Description' },
        { name: 'diagramSrc', type: 'text', label: 'Diagram SVG Path' },
      ],
    }),
    defineBlock({
      name: 'mcp',
      label: 'MCP Section',
      fields: [
        { name: 'label', type: 'text', label: 'Section Label' },
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'description', type: 'textarea', label: 'Section Description' },
        {
          name: 'cards',
          type: 'array',
          label: 'MCP Cards',
          fields: [
            { name: 'type', type: 'select', options: [
              { label: 'Public', value: 'public' },
              { label: 'Authenticated', value: 'auth' },
            ]},
            { name: 'badge', type: 'text', label: 'Badge' },
            { name: 'title', type: 'text', label: 'Title' },
            { name: 'description', type: 'textarea', label: 'Description' },
            { name: 'tools', type: 'textarea', label: 'Tools List' },
          ],
        },
      ],
    }),
    defineBlock({
      name: 'cta',
      label: 'Call to Action',
      fields: [
        { name: 'label', type: 'text', label: 'Section Label' },
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'subtitle', type: 'text', label: 'Subtitle' },
        { name: 'primaryCta', type: 'text', label: 'Primary CTA Text' },
        { name: 'primaryCtaUrl', type: 'text', label: 'Primary CTA URL' },
        { name: 'secondaryCta', type: 'text', label: 'Secondary CTA Text' },
        { name: 'secondaryCtaUrl', type: 'text', label: 'Secondary CTA URL' },
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
  api: { port: 3020 },
});
