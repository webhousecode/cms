<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Content Structure

## Content Structure

Every document is stored as a JSON file at `content/<collection>/<slug>.json` with this shape:

```typescript
interface Document {
  id: string;                    // Unique ID (generated, e.g. "a1b2c3d4")
  slug: string;                  // URL-safe identifier, used as filename
  collection: string;            // Collection name
  // Status: 'draft' (not live), 'published' (live), 'expired' (scheduler unpublished), 'archived'
  status: 'draft' | 'published' | 'archived' | 'expired';
  data: Record<string, unknown>; // All field values live here
  _fieldMeta: Record<string, {   // Per-field metadata (AI provenance, locks)
    lockedBy?: 'user' | 'ai' | 'import';
    lockedAt?: string;
    aiGenerated?: boolean;
    aiModel?: string;
  }>;
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  locale?: string;               // BCP 47 locale tag, e.g. "en", "da"
  translationOf?: string;        // Slug of source document (for translations)
  publishAt?: string;            // ISO timestamp for scheduled publishing
  unpublishAt?: string;          // ISO timestamp for scheduled expiry
}
```

Example file `content/posts/hello-world.json`:
```json
{
  "id": "abc123",
  "slug": "hello-world",
  "collection": "posts",
  "status": "published",
  "data": {
    "title": "Hello, World!",
    "excerpt": "My first post.",
    "content": "# Hello\n\nWelcome to my blog.",
    "date": "2025-01-15T10:00:00.000Z",
    "tags": ["intro", "welcome"]
  },
  "_fieldMeta": {},
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-01-15T10:00:00.000Z"
}
```
