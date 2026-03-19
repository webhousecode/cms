# F08 — RAG Knowledge Base

> Retrieval-augmented generation over all site content for context-aware AI content creation.

## Problem

AI agents generate content without context about what has already been published on the site. This leads to duplicate topics, inconsistent terminology, and missed opportunities for internal linking. The AI has no memory of the site's existing knowledge.

## Solution

Auto-index all published documents into a vector store (pgvector via Supabase or local SQLite with `sqlite-vec`). AI agents query the knowledge base for relevant context before generating new content. The knowledge base grows with every publish.

## Technical Design

### Vector Store

```typescript
// packages/cms-ai/src/rag/vector-store.ts

export interface VectorStoreConfig {
  adapter: 'sqlite-vec' | 'pgvector';
  sqliteVec?: { path: string };
  pgvector?: { connectionString: string };
  embeddingModel?: string; // default: 'text-embedding-3-small'
  chunkSize?: number;      // default: 512 tokens
  chunkOverlap?: number;   // default: 50 tokens
}

export interface VectorChunk {
  id: string;
  collection: string;
  documentSlug: string;
  content: string;
  embedding: number[];     // float32 array
  metadata: {
    field: string;         // which field this chunk came from
    position: number;      // chunk index within the field
    documentTitle: string;
  };
  createdAt: string;
}

export interface VectorStore {
  initialize(): Promise<void>;
  upsertDocument(collection: string, slug: string, chunks: VectorChunk[]): Promise<void>;
  removeDocument(collection: string, slug: string): Promise<void>;
  query(embedding: number[], options: { limit?: number; collection?: string }): Promise<VectorChunk[]>;
  close(): Promise<void>;
}
```

### Embedding Service

```typescript
// packages/cms-ai/src/rag/embeddings.ts

export class EmbeddingService {
  constructor(private provider: AiProvider) {}

  async embed(text: string): Promise<number[]>;
  async embedBatch(texts: string[]): Promise<number[][]>;

  /** Split document content into chunks */
  static chunk(text: string, options: { size: number; overlap: number }): string[];
}
```

### RAG Pipeline

```typescript
// packages/cms-ai/src/rag/pipeline.ts

export class RagPipeline {
  constructor(private store: VectorStore, private embeddings: EmbeddingService) {}

  /** Index a single document (called on publish) */
  async indexDocument(doc: Document, collection: CollectionConfig): Promise<void>;

  /** Remove a document from the index (called on delete/archive) */
  async removeDocument(collection: string, slug: string): Promise<void>;

  /** Query for relevant context */
  async retrieve(query: string, options?: {
    limit?: number;
    collection?: string;
  }): Promise<string>;

  /** Re-index all published documents */
  async reindexAll(config: CmsConfig, storage: StorageAdapter): Promise<void>;
}
```

### Integration with Content Agents

The `ContentAgent.generate()` method is extended to include RAG context:

```typescript
// In ContentAgent.generate():
const context = await this.rag.retrieve(prompt, { limit: 5 });
const systemPrompt = `... Existing site content for context:\n${context}`;
```

## Impact Analysis

### Files affected
- `packages/cms-ai/src/rag/vector-store.ts` — new vector store module
- `packages/cms-ai/src/rag/embeddings.ts` — new embedding service
- `packages/cms-ai/src/rag/pipeline.ts` — new RAG pipeline
- `packages/cms-ai/src/agents/content.ts` — inject RAG context into generation
- `packages/cms/src/schema/types.ts` — add `rag` config to `CmsConfig`
- `packages/cms-admin/src/app/admin/settings/` — add reindex button

### Blast radius
- `ContentAgent.generate()` behavior changes — existing AI output may differ with RAG context
- New `sqlite-vec` dependency could cause install issues on some platforms

### Breaking changes
- None — RAG is opt-in via config

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Documents indexed on publish
- [ ] RAG query returns relevant chunks
- [ ] Content agent uses RAG context when enabled
- [ ] Reindex rebuilds full index

## Implementation Steps

1. Install `sqlite-vec` (for local) or configure pgvector connection
2. Create `packages/cms-ai/src/rag/embeddings.ts` using OpenAI `text-embedding-3-small`
3. Create `packages/cms-ai/src/rag/vector-store.ts` with SQLite-vec adapter
4. Create `packages/cms-ai/src/rag/pipeline.ts` with index/query/remove methods
5. Add `rag` config option to CmsConfig
6. Hook into document publish: auto-index new/updated published documents
7. Hook into document delete: remove from vector store
8. Update `ContentAgent.generate()` to retrieve context before generation
9. Add "Reindex" button in admin settings
10. Add admin page showing indexed document count and search test

## Dependencies

- OpenAI API key (for embeddings)
- `sqlite-vec` npm package or Supabase with pgvector

## Effort Estimate

**Large** — 5-7 days
