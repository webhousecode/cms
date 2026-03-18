import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StorageAdapter, Document, DocumentInput, QueryOptions, QueryResult } from '../types.js';
import { generateId } from '../../utils/id.js';
import { generateSlug } from '../../utils/slug.js';
import { now } from '../../utils/date.js';

export class FilesystemStorageAdapter implements StorageAdapter {
  private contentDir: string;

  constructor(contentDir: string = 'content') {
    this.contentDir = contentDir;
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.contentDir)) {
      mkdirSync(this.contentDir, { recursive: true });
    }
  }

  private collectionDir(collection: string): string {
    return join(this.contentDir, collection);
  }

  private documentPath(collection: string, slug: string): string {
    return join(this.collectionDir(collection), `${slug}.json`);
  }

  private readDocument(collection: string, slug: string): Document | null {
    const path = this.documentPath(collection, slug);
    if (!existsSync(path)) return null;
    try {
      const doc = JSON.parse(readFileSync(path, 'utf-8')) as Document;
      // Legacy files may lack an id — assign and persist one immediately
      if (!doc.id) {
        doc.id = generateId();
        writeFileSync(path, JSON.stringify({ ...doc, _fieldMeta: doc._fieldMeta ?? {} }, null, 2), 'utf-8');
      }
      return { ...doc, _fieldMeta: doc._fieldMeta ?? {} };
    } catch {
      return null;
    }
  }

  async migrate(collections: string[]): Promise<void> {
    for (const collection of collections) {
      const dir = this.collectionDir(collection);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  async create(collection: string, input: DocumentInput): Promise<Document> {
    const dir = this.collectionDir(collection);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const id = generateId();
    const slug = input.slug ?? generateSlug(String(input.data['title'] ?? id));
    const timestamp = now();

    const doc: Document = {
      id,
      slug,
      collection,
      status: input.status ?? 'draft',
      data: input.data,
      _fieldMeta: input._fieldMeta ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.locale !== undefined && { locale: input.locale }),
      ...(input.translationOf !== undefined && { translationOf: input.translationOf }),
      ...(input.publishAt != null && { publishAt: input.publishAt }),
      ...(input.unpublishAt != null && { unpublishAt: input.unpublishAt }),
    };

    writeFileSync(this.documentPath(collection, slug), JSON.stringify(doc, null, 2), 'utf-8');
    return doc;
  }

  async findById(collection: string, id: string): Promise<Document | null> {
    if (!id) return null; // guard: never match documents with missing ids
    const dir = this.collectionDir(collection);
    if (!existsSync(dir)) return null;

    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const slug = file.replace('.json', '');
      const doc = this.readDocument(collection, slug);
      if (doc?.id === id) return doc;
    }
    return null;
  }

  async findBySlug(collection: string, slug: string): Promise<Document | null> {
    return this.readDocument(collection, slug);
  }

  async findMany(collection: string, options: QueryOptions = {}): Promise<QueryResult> {
    const dir = this.collectionDir(collection);
    if (!existsSync(dir)) return { documents: [], total: 0 };

    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    let documents: Document[] = [];

    for (const file of files) {
      const slug = file.replace('.json', '');
      const doc = this.readDocument(collection, slug);
      if (doc) documents.push(doc);
    }

    if (options.status) {
      documents = documents.filter(d => d.status === options.status);
    }

    if (options.locale) {
      documents = documents.filter(d => d.locale === options.locale);
    }

    if (options.translationOf) {
      documents = documents.filter(d => d.translationOf === options.translationOf);
    }

    if (options.tags && options.tags.length > 0) {
      documents = documents.filter(d => {
        const docTags = d.data['tags'];
        if (!Array.isArray(docTags)) return false;
        return options.tags!.every(tag => docTags.includes(tag));
      });
    }

    const orderBy = options.orderBy ?? 'createdAt';
    const order = options.order ?? 'desc';
    const DOC_KEYS = new Set<string>(['id', 'slug', 'collection', 'status', 'createdAt', 'updatedAt']);
    documents.sort((a, b) => {
      const getVal = (doc: Document): string => {
        if (DOC_KEYS.has(orderBy)) return String(doc[orderBy as keyof Document] ?? '');
        return String(doc.data[orderBy] ?? '');
      };
      const aVal = getVal(a);
      const bVal = getVal(b);
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return order === 'asc' ? aNum - bNum : bNum - aNum;
      }
      return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    const total = documents.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? total;
    documents = documents.slice(offset, offset + limit);

    return { documents, total };
  }

  async update(collection: string, id: string, input: Partial<DocumentInput>): Promise<Document> {
    const existing = await this.findById(collection, id);
    if (!existing) throw new Error(`Document ${id} not found in collection ${collection}`);

    const updated: Document = {
      ...existing,
      status: input.status ?? existing.status,
      data: input.data ? { ...existing.data, ...input.data } : existing.data,
      _fieldMeta: input._fieldMeta ?? existing._fieldMeta ?? {},
      updatedAt: now(),
      ...(((input.locale !== undefined ? input.locale : existing.locale) !== undefined) && { locale: input.locale !== undefined ? input.locale : existing.locale }),
      ...(((input.translationOf !== undefined ? input.translationOf : existing.translationOf) !== undefined) && { translationOf: input.translationOf !== undefined ? input.translationOf : existing.translationOf }),
      ...(() => {
        if (input.publishAt === null) return {};
        const pa = input.publishAt !== undefined ? input.publishAt : existing.publishAt;
        return pa !== undefined ? { publishAt: pa } : {};
      })(),
      ...(() => {
        if (input.unpublishAt === null) return {};
        const ua = input.unpublishAt !== undefined ? input.unpublishAt : (existing as any).unpublishAt;
        return ua !== undefined ? { unpublishAt: ua } : {};
      })(),
    };

    // Explicitly delete schedule fields when set to null
    if (input.publishAt === null) delete (updated as any).publishAt;
    if (input.unpublishAt === null) delete (updated as any).unpublishAt;

    if (input.slug && input.slug !== existing.slug) {
      unlinkSync(this.documentPath(collection, existing.slug));
      updated.slug = input.slug;
    }

    writeFileSync(this.documentPath(collection, updated.slug), JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  async delete(collection: string, id: string): Promise<void> {
    const doc = await this.findById(collection, id);
    if (!doc) throw new Error(`Document ${id} not found in collection ${collection}`);
    const path = this.documentPath(collection, doc.slug);
    if (existsSync(path)) unlinkSync(path);
  }

  async close(): Promise<void> {
    // No-op for filesystem adapter
  }
}
