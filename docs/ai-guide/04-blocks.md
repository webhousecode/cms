<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Block System

## Why blocks? (IMPORTANT — read this first)

**Blocks are the recommended way to build content-rich pages.** Don't default to `text` and `textarea` fields for everything — that produces flat, rigid content structures. Instead, use a `blocks` field to let editors compose pages from reusable sections.

### When to use blocks vs. flat fields

| Use case | Approach |
|----------|----------|
| Blog post with mixed content (text, images, code, quotes, videos) | **`blocks` field** with content-block, image-block, code-block, quote-block, video-block |
| Landing page with hero, features, testimonials, CTA | **`blocks` field** with hero, features, testimonials, cta blocks |
| Simple data entry (name, email, phone) | Flat fields (`text`, `text`, `text`) |
| Product with fixed structure (title, price, description) | Flat fields |

**Rule of thumb:** If the content could have variable sections in any order, use blocks. If it's a fixed schema, use flat fields.

### Example: Blog with blocks (recommended)

Instead of just `{ name: 'content', type: 'richtext' }`, use blocks for richer content:

```typescript
export default defineConfig({
  blocks: [
    defineBlock({
      name: 'text-block',
      label: 'Text',
      fields: [
        { name: 'body', type: 'richtext', label: 'Content' },
      ],
    }),
    defineBlock({
      name: 'image-block',
      label: 'Image',
      fields: [
        { name: 'image', type: 'image', label: 'Image' },
        { name: 'caption', type: 'text', label: 'Caption' },
        { name: 'alt', type: 'text', label: 'Alt text' },
      ],
    }),
    defineBlock({
      name: 'quote-block',
      label: 'Quote',
      fields: [
        { name: 'text', type: 'textarea', label: 'Quote' },
        { name: 'author', type: 'text', label: 'Author' },
      ],
    }),
    defineBlock({
      name: 'code-block',
      label: 'Code',
      fields: [
        { name: 'code', type: 'textarea', label: 'Code' },
        { name: 'language', type: 'select', label: 'Language', options: [
          { label: 'TypeScript', value: 'typescript' },
          { label: 'JavaScript', value: 'javascript' },
          { label: 'HTML', value: 'html' },
          { label: 'CSS', value: 'css' },
          { label: 'Shell', value: 'bash' },
        ]},
      ],
    }),
    defineBlock({
      name: 'video-block',
      label: 'Video',
      fields: [
        { name: 'url', type: 'text', label: 'Video URL (YouTube/Vimeo)' },
        { name: 'caption', type: 'text', label: 'Caption' },
      ],
    }),
    defineBlock({
      name: 'gallery-block',
      label: 'Image Gallery',
      fields: [
        { name: 'images', type: 'image-gallery', label: 'Images' },
        { name: 'layout', type: 'select', label: 'Layout', options: [
          { label: 'Grid', value: 'grid' },
          { label: 'Masonry', value: 'masonry' },
          { label: 'Carousel', value: 'carousel' },
        ]},
      ],
    }),
  ],
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'date', type: 'date' },
        { name: 'heroImage', type: 'image' },
        { name: 'tags', type: 'tags' },
        { name: 'sections', type: 'blocks', label: 'Content', blocks: [
          'text-block', 'image-block', 'quote-block', 'code-block', 'video-block', 'gallery-block',
        ]},
      ],
    }),
  ],
});
```

This gives editors a visual block editor where they can compose posts from text, images, quotes, code snippets, videos, and galleries — in any order, any number of times.

## Defining blocks

Blocks are reusable content structures defined at the top level of your config:

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

## JSON storage format

Each block item includes a `_block` discriminator:
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

## Rendering blocks

Use `_block` to determine which component to render:
```typescript
function renderSection(block: Record<string, unknown>) {
  switch (block._block) {
    case 'hero': return <Hero tagline={block.tagline as string} />;
    case 'features': return <Features items={block.items as Item[]} />;
    case 'text-block': return <div className="prose" dangerouslySetInnerHTML={{ __html: block.body as string }} />;
    case 'image-block': return <figure><img src={block.image as string} alt={block.alt as string} /><figcaption>{block.caption as string}</figcaption></figure>;
    case 'quote-block': return <blockquote><p>{block.text as string}</p><cite>{block.author as string}</cite></blockquote>;
  }
}

// In your page:
export default function PostPage({ params }) {
  const post = getDocument('posts', params.slug);
  return (
    <article>
      <h1>{post.data.title}</h1>
      {post.data.sections?.map((block, i) => (
        <div key={i}>{renderSection(block)}</div>
      ))}
    </article>
  );
}
```

## Common block patterns

### Landing page blocks
`hero`, `features`, `testimonials`, `pricing`, `cta`, `faq`, `stats`, `team`

### Blog content blocks
`text-block`, `image-block`, `quote-block`, `code-block`, `video-block`, `gallery-block`, `callout-block`

### Portfolio blocks
`project-card`, `image-gallery`, `video-showcase`, `skills-grid`, `timeline`

Each block can use any field type — including `image-gallery`, `array`, `object`, `select`, `relation`, and nested `blocks`.
