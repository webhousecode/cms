<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Block System

## Block System

Blocks are reusable content structures used within `blocks`-type fields. Define them at the top level of your config:

```typescript
export default defineConfig({
  blocks: [
    defineBlock({
      name: 'hero',          // Unique block identifier
      label: 'Hero Section', // Human-readable label
      fields: [
        { name: 'tagline', type: 'text', label: 'Tagline' },
        { name: 'description', type: 'textarea' },
        { name: 'ctaText', type: 'text', label: 'CTA Text' },
        { name: 'ctaUrl', type: 'text', label: 'CTA URL' },
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'items', type: 'array', fields: [
          { name: 'icon', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'description', type: 'textarea' },
        ]},
      ],
    }),
  ],
  collections: [
    defineCollection({
      name: 'pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'sections', type: 'blocks', blocks: ['hero', 'features'] },
      ],
    }),
  ],
});
```

In the stored JSON, each block item includes a `_block` discriminator:
```json
{
  "data": {
    "sections": [
      { "_block": "hero", "tagline": "Build faster", "ctaText": "Get Started" },
      { "_block": "features", "title": "Why Us", "items": [ /* ... */ ] }
    ]
  }
}
```

When rendering, use `_block` to determine which component to render:
```typescript
function renderSection(block: Record<string, unknown>) {
  switch (block._block) {
    case 'hero': return <Hero tagline={block.tagline as string} />;
    case 'features': return <Features items={block.items as Item[]} />;
  }
}
```
