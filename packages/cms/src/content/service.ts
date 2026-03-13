import type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult, WriteContext } from '../storage/types.js';
import type { ContentHooks } from './hooks.js';
import type { CmsConfig } from '../schema/types.js';
import { computeFieldMetaChanges, buildInitialFieldMeta } from './field-meta.js';

const DEFAULT_CONTEXT: WriteContext = { actor: 'user' };

export class ContentService {
  constructor(
    private storage: StorageAdapter,
    private config: CmsConfig,
    private hooks: ContentHooks = {},
  ) {}

  private getCollection(name: string) {
    const col = this.config.collections.find(c => c.name === name);
    if (!col) throw new Error(`Collection "${name}" not found in config`);
    return col;
  }

  async create(collection: string, input: DocumentInput, context: WriteContext = DEFAULT_CONTEXT): Promise<Document> {
    this.getCollection(collection);

    // Build initial _fieldMeta for AI-generated content
    const fieldMeta = buildInitialFieldMeta(input.data, context);
    let processedInput: DocumentInput = { ...input, _fieldMeta: { ...fieldMeta, ...input._fieldMeta } };

    if (this.hooks.beforeCreate) {
      processedInput = await this.hooks.beforeCreate(collection, processedInput, context);
    }

    const doc = await this.storage.create(collection, processedInput);

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

    let processedInput = input;
    if (this.hooks.beforeUpdate) {
      processedInput = await this.hooks.beforeUpdate(collection, id, input, context);
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

    let processedInput = input;
    if (this.hooks.beforeUpdate) {
      processedInput = await this.hooks.beforeUpdate(collection, id, input, context);
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

    if (this.hooks.afterUpdate) {
      await this.hooks.afterUpdate(collection, doc, context);
    }

    return { document: doc, skippedFields };
  }

  /**
   * Publish all draft documents whose publishAt timestamp is in the past.
   * Called by the cron job every minute. Returns slugs of published documents.
   */
  async publishDue(collections?: string[]): Promise<{ collection: string; slug: string }[]> {
    const targets = collections ?? this.config.collections.map(c => c.name);
    const now = new Date();
    const published: { collection: string; slug: string }[] = [];

    for (const col of targets) {
      const { documents } = await this.storage.findMany(col, { status: 'draft' }).catch(() => ({ documents: [] }));
      for (const doc of documents) {
        if (!doc.publishAt) continue;
        if (new Date(doc.publishAt) > now) continue;
        await this.storage.update(col, doc.id, {
          status: 'published',
          publishAt: null, // clear the schedule
        });
        published.push({ collection: col, slug: doc.slug });
      }
    }
    return published;
  }

  async delete(collection: string, id: string, context: WriteContext = DEFAULT_CONTEXT): Promise<void> {
    this.getCollection(collection);

    if (this.hooks.beforeDelete) {
      await this.hooks.beforeDelete(collection, id, context);
    }

    await this.storage.delete(collection, id);

    if (this.hooks.afterDelete) {
      await this.hooks.afterDelete(collection, id, context);
    }
  }
}
