import type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult, WriteContext, SearchOptions, SearchResult } from '../storage/types.js';
import type { ContentHooks, CollectionHooks } from './hooks.js';
import type { CmsConfig } from '../schema/types.js';
import { computeFieldMetaChanges, buildInitialFieldMeta } from './field-meta.js';

const DEFAULT_CONTEXT: WriteContext = { actor: 'user' };

export class ContentService {
  constructor(
    private storage: StorageAdapter,
    private config: CmsConfig,
    private hooks: ContentHooks = {},
  ) {}

  /** Get collection-level hooks from the collection config, if any. */
  private getCollectionHooks(name: string): CollectionHooks | undefined {
    const col = this.config.collections.find(c => c.name === name);
    return col?.hooks;
  }

  private getCollection(name: string) {
    const col = this.config.collections.find(c => c.name === name);
    if (!col) throw new Error(`Collection "${name}" not found in config`);
    return col;
  }

  async create(collection: string, input: DocumentInput, context: WriteContext = DEFAULT_CONTEXT): Promise<Document> {
    this.getCollection(collection);
    const colHooks = this.getCollectionHooks(collection);

    // Build initial _fieldMeta for AI-generated content
    const fieldMeta = buildInitialFieldMeta(input.data, context);
    let processedInput: DocumentInput = { ...input, _fieldMeta: { ...fieldMeta, ...input._fieldMeta } };

    // Collection-level beforeCreate hook — can modify input
    if (colHooks?.beforeCreate) {
      const modified = await colHooks.beforeCreate(processedInput, context);
      if (modified) processedInput = modified;
    }

    // Engine-level beforeCreate hook
    if (this.hooks.beforeCreate) {
      processedInput = await this.hooks.beforeCreate(collection, processedInput, context);
    }

    const doc = await this.storage.create(collection, processedInput);

    // Collection-level afterCreate hook
    if (colHooks?.afterCreate) {
      await colHooks.afterCreate(doc, context);
    }

    // Engine-level afterCreate hook
    if (this.hooks.afterCreate) {
      await this.hooks.afterCreate(collection, doc, context);
    }

    return doc;
  }

  async findById(collection: string, id: string): Promise<Document | null> {
    this.getCollection(collection);
    return this.storage.findById(collection, id);
  }

  async findBySlug(collection: string, slug: string): Promise<Document | null> {
    this.getCollection(collection);
    return this.storage.findBySlug(collection, slug);
  }

  async findMany(collection: string, options?: QueryOptions): Promise<QueryResult> {
    this.getCollection(collection);
    return this.storage.findMany(collection, options);
  }

  /**
   * Find all documents across one or more collections that have the given tag.
   * If no collections are specified, searches all configured collections.
   */
  async findByTag(
    tag: string,
    collections?: string[],
    options?: Omit<QueryOptions, 'tags'>,
  ): Promise<QueryResult> {
    const targets = collections ?? this.config.collections.map(c => c.name);
    const results = await Promise.all(
      targets.map(col =>
        this.storage.findMany(col, { ...options, tags: [tag] }).catch(() => ({ documents: [], total: 0 })),
      ),
    );
    const documents = results.flatMap(r => r.documents);
    return { documents, total: documents.length };
  }

  async update(
    collection: string,
    id: string,
    input: Partial<DocumentInput>,
    context: WriteContext = DEFAULT_CONTEXT,
  ): Promise<Document> {
    this.getCollection(collection);
    const colHooks = this.getCollectionHooks(collection);

    let processedInput = input;

    // Collection-level beforeUpdate hook — can modify input
    if (colHooks?.beforeUpdate) {
      const existing = await this.storage.findById(collection, id);
      if (existing) {
        const modified = await colHooks.beforeUpdate(id, processedInput, existing, context);
        if (modified) processedInput = modified;
      }
    }

    // Engine-level beforeUpdate hook
    if (this.hooks.beforeUpdate) {
      processedInput = await this.hooks.beforeUpdate(collection, id, processedInput, context);
    }

    // Apply field-level lock logic when data is being updated
    if (processedInput.data) {
      const existing = await this.storage.findById(collection, id);
      if (existing) {
        const { filteredData, updatedMeta } = computeFieldMetaChanges(
          existing.data,
          processedInput.data,
          existing._fieldMeta ?? {},
          context,
        );
        processedInput = {
          ...processedInput,
          data: filteredData,
          _fieldMeta: updatedMeta,
        };
      }
    }

    const doc = await this.storage.update(collection, id, processedInput);

    // Collection-level afterUpdate hook
    if (colHooks?.afterUpdate) {
      await colHooks.afterUpdate(doc, context);
    }

    // Engine-level afterUpdate hook
    if (this.hooks.afterUpdate) {
      await this.hooks.afterUpdate(collection, doc, context);
    }

    return doc;
  }

  /**
   * Same as update() but also returns the list of fields that were skipped
   * because they were locked and the actor was 'ai'.
   */
  async updateWithContext(
    collection: string,
    id: string,
    input: Partial<DocumentInput>,
    context: WriteContext,
  ): Promise<{ document: Document; skippedFields: string[] }> {
    this.getCollection(collection);
    const colHooks = this.getCollectionHooks(collection);

    let processedInput = input;

    // Collection-level beforeUpdate hook — can modify input
    if (colHooks?.beforeUpdate) {
      const existing = await this.storage.findById(collection, id);
      if (existing) {
        const modified = await colHooks.beforeUpdate(id, processedInput, existing, context);
        if (modified) processedInput = modified;
      }
    }

    // Engine-level beforeUpdate hook
    if (this.hooks.beforeUpdate) {
      processedInput = await this.hooks.beforeUpdate(collection, id, processedInput, context);
    }

    let skippedFields: string[] = [];

    if (processedInput.data) {
      const existing = await this.storage.findById(collection, id);
      if (existing) {
        const changes = computeFieldMetaChanges(
          existing.data,
          processedInput.data,
          existing._fieldMeta ?? {},
          context,
        );
        skippedFields = changes.skippedFields;
        processedInput = {
          ...processedInput,
          data: changes.filteredData,
          _fieldMeta: changes.updatedMeta,
        };
      }
    }

    const doc = await this.storage.update(collection, id, processedInput);

    // Collection-level afterUpdate hook
    if (colHooks?.afterUpdate) {
      await colHooks.afterUpdate(doc, context);
    }

    // Engine-level afterUpdate hook
    if (this.hooks.afterUpdate) {
      await this.hooks.afterUpdate(collection, doc, context);
    }

    return { document: doc, skippedFields };
  }

  /**
   * Publish all draft documents whose publishAt timestamp is in the past.
   * Called by the cron job every minute. Returns slugs of published documents.
   */
  async publishDue(collections?: string[]): Promise<{ collection: string; slug: string; action: 'published' | 'unpublished' }[]> {
    const targets = collections ?? this.config.collections.map(c => c.name);
    const now = new Date();
    const actions: { collection: string; slug: string; action: 'published' | 'unpublished' }[] = [];

    for (const col of targets) {
      const { documents } = await this.storage.findMany(col).catch(() => ({ documents: [] }));
      for (const doc of documents) {
        // Scheduled publish: draft with publishAt in the past → published
        if (doc.status === 'draft' && doc.publishAt) {
          if (new Date(doc.publishAt) <= now) {
            await this.storage.update(col, doc.id, {
              status: 'published',
              publishAt: null,
            });
            actions.push({ collection: col, slug: doc.slug, action: 'published' });
            continue; // Don't also check unpublish on same tick
          }
        }

        // Scheduled unpublish: published with unpublishAt in the past → expired
        // Also clear publishAt to prevent re-publish loop
        if (doc.status === 'published' && (doc as any).unpublishAt) {
          const unpublishAt = new Date((doc as any).unpublishAt);
          if (unpublishAt <= now) {
            await this.storage.update(col, doc.id, {
              status: 'expired',
              unpublishAt: null,
              publishAt: null,
            });
            actions.push({ collection: col, slug: doc.slug, action: 'unpublished' });
          }
        }
      }
    }
    return actions;
  }

  /**
   * Full-text search across collections. Searches title, slug, excerpt, description and content.
   * Results are scored: exact title > slug match > prefix > excerpt > content body.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const limit = options?.limit ?? 20;
    const targets = options?.collections
      ? this.config.collections.filter(c => options.collections!.includes(c.name))
      : this.config.collections.filter(c => c.name !== 'global');

    const results: SearchResult[] = [];

    for (const col of targets) {
      const queryOpts: QueryOptions = {};
      if (options?.status) queryOpts.status = options.status;
      const { documents } = await this.storage
        .findMany(col.name, queryOpts)
        .catch(() => ({ documents: [] as Document[] }));

      for (const doc of documents) {
        const title = String(doc.data['title'] ?? doc.data['name'] ?? doc.data['label'] ?? doc.slug).toLowerCase();
        const slug = doc.slug.toLowerCase();
        const excerpt = String(doc.data['excerpt'] ?? doc.data['description'] ?? '').toLowerCase();
        const rawContent = String(doc.data['content'] ?? '');
        const content = rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase();

        let score = 0;
        if (title === q) score = 100;
        else if (slug === q) score = 80;
        else if (title.startsWith(q)) score = 50;
        else if (slug.startsWith(q)) score = 40;
        else if (title.includes(q)) score = 30;
        else if (excerpt.includes(q)) score = 20;
        else if (content.includes(q)) score = 10;

        if (score === 0) continue;

        const urlPrefix = (col as { urlPrefix?: string }).urlPrefix ?? '';
        const url = urlPrefix ? `${urlPrefix}/${doc.slug}` : `/${doc.slug}`;

        // Build excerpt: prefer excerpt field, fallback to stripped content
        const excerptText = String(doc.data['excerpt'] ?? doc.data['description'] ?? '');
        const snippetSource = excerptText || rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const snippetMax = 160;
        const snippet = snippetSource.length > snippetMax
          ? snippetSource.slice(0, snippetMax) + '…'
          : snippetSource;

        results.push({
          collection: col.name,
          collectionLabel: col.label ?? col.name,
          slug: doc.slug,
          title: String(doc.data['title'] ?? doc.data['name'] ?? doc.data['label'] ?? doc.slug),
          excerpt: snippet,
          url,
          status: doc.status,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return results.slice(0, limit);
  }

  async delete(collection: string, id: string, context: WriteContext = DEFAULT_CONTEXT): Promise<void> {
    this.getCollection(collection);
    const colHooks = this.getCollectionHooks(collection);

    // Fetch the document before deletion so hooks receive the full document
    const doc = await this.storage.findById(collection, id);

    // Collection-level beforeDelete hook — return false to cancel
    if (colHooks?.beforeDelete && doc) {
      const result = await colHooks.beforeDelete(doc, context);
      if (result === false) return;
    }

    // Engine-level beforeDelete hook
    if (this.hooks.beforeDelete) {
      await this.hooks.beforeDelete(collection, id, context);
    }

    await this.storage.delete(collection, id);

    // Collection-level afterDelete hook
    if (colHooks?.afterDelete && doc) {
      await colHooks.afterDelete(doc, context);
    }

    // Engine-level afterDelete hook
    if (this.hooks.afterDelete) {
      await this.hooks.afterDelete(collection, id, context);
    }
  }
}
