# F66 — Search Index

> Persistent SQLite FTS5 search index for instant full-text search across all documents.

## Problem

Current search scans all documents via storage adapter on every query — O(n) per collection. For GitHub-backed sites this means multiple API calls per search. At 5000+ documents, search becomes unusably slow regardless of adapter.

## Solution

SQLite FTS5 database stored in `_data/search-index.db`. Built incrementally on document create/update/delete via storage hooks. Cold-start builder syncs all content on first request. Field-weighted ranking (title 10x > excerpt 3x > content 1x). Works with all storage adapters.

## Technical Design

### Search Index Service

File: `packages/cms/src/search/index-service.ts`

```typescript
interface SearchIndexService {
  search(query: string, options?: { collections?: string[]; limit?: number; status?: string }): Promise<SearchHit[]>;
  indexDocument(collection: string, doc: Document): Promise<void>;
  removeDocument(collection: string, docId: string): Promise<void>;
  rebuildAll(collections: CollectionConfig[]): Promise<{ indexed: number }>;
  close(): Promise<void>;
}

interface SearchHit {
  collection: string;
  slug: string;
  title: string;
  excerpt: string;
  status: string;
  score: number;
  highlights?: { field: string; snippet: string }[];
}
```

### SQLite FTS5 Schema

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  doc_id,
  collection,
  slug,
  status,
  title,
  excerpt,
  content,
  tokenize='porter unicode61'
);

-- Ranking: title matches worth 10x, excerpt 3x, content 1x
-- FTS5 rank function with column weights
```

### Storage Hooks

Modify `packages/cms/src/content/service.ts`:
- After `create()` → `searchIndex.indexDocument()`
- After `update()` → `searchIndex.indexDocument()` (upsert)
- After `delete()` → `searchIndex.removeDocument()`

### Cold Start

On first search request, if index is empty or stale:
1. Check `_data/search-index.meta.json` for last build timestamp
2. If older than content dir mtime → rebuild
3. Full rebuild: iterate all collections, index all documents
4. Store build timestamp

### Admin API

File: `packages/cms-admin/src/app/api/search/route.ts`
- Modify existing route to use index service instead of manual scan
- Fallback to current approach if index unavailable

### npm Package

Uses `better-sqlite3` (already a common Node.js SQLite package, zero config).

## Implementation Steps

1. Add `better-sqlite3` dependency to `packages/cms`
2. Create `SearchIndexService` with FTS5 table
3. Add storage hooks in content service (create/update/delete)
4. Add cold-start builder
5. Update admin search API to use index
6. Add rebuild command to CLI (`cms search rebuild`)
7. Test with filesystem + GitHub adapters

## Dependencies

- None (core CMS feature)

## Effort Estimate

**Medium** — 3-4 days
