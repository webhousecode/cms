<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# API Reference

## Programmatic Usage

You can use the CMS engine programmatically (e.g. in scripts or API routes):

```typescript
import { createCms, defineConfig, defineCollection } from '@webhouse/cms';

const config = defineConfig({
  collections: [
    defineCollection({ name: 'posts', fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'content', type: 'richtext' },
    ]}),
  ],
  storage: { adapter: 'filesystem', filesystem: { contentDir: 'content' } },
});

const cms = await createCms(config);

// Create a document
const doc = await cms.content.create('posts', {
  status: 'published',
  data: { title: 'Hello', content: '# Hello World' },
}, { actor: 'user' });

// Query documents
const { documents } = await cms.content.findMany('posts', {
  status: 'published',
  orderBy: 'createdAt',
  order: 'desc',
  limit: 10,
});

// Find by slug
const post = await cms.content.findBySlug('posts', 'hello');

// Update
await cms.content.update('posts', doc.id, {
  data: { title: 'Updated Title' },
});

// Clean up
await cms.storage.close();
```
