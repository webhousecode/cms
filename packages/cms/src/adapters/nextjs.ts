/**
 * Next.js adapter for @webhouse/cms
 *
 * Pure filesystem helpers that read JSON content files at build time (SSG)
 * or request time (SSR). No network calls, no SDK client needed.
 *
 * Usage:
 *   import { getCollection, getDocument } from '@webhouse/cms/adapters';
 *   // or with custom content dir:
 *   import { createContentLoader } from '@webhouse/cms/adapters';
 *   const { getCollection, getDocument } = createContentLoader('./my-content');
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Document, DocumentStatus } from '../storage/types.js';

// Re-export Document type for consumer convenience
export type { Document, DocumentStatus };

/** Options for querying a collection */
export interface CollectionOptions {
  /** Filter by document status. Defaults to 'published'. */
  status?: 'published' | 'draft' | 'all';
  /** Field to sort by. Supports top-level document fields (createdAt, updatedAt, slug) or data fields. Defaults to 'createdAt'. */
  orderBy?: string;
  /** Sort direction. Defaults to 'desc'. */
  order?: 'asc' | 'desc';
  /** Maximum number of documents to return. */
  limit?: number;
}

const DOC_KEYS = new Set<string>(['id', 'slug', 'collection', 'status', 'createdAt', 'updatedAt']);

function resolveContentDir(contentDir?: string): string {
  return contentDir
    ? (contentDir.startsWith('/') ? contentDir : join(process.cwd(), contentDir))
    : join(process.cwd(), 'content');
}

function readDoc<T>(filePath: string): Document & { data: T } {
  const raw = readFileSync(filePath, 'utf-8');
  const doc = JSON.parse(raw) as Document & { data: T };
  // Ensure _fieldMeta always exists
  if (!doc._fieldMeta) {
    (doc as Document)._fieldMeta = {};
  }
  return doc;
}

function sortDocuments<T>(documents: (Document & { data: T })[], orderBy: string, order: 'asc' | 'desc'): void {
  documents.sort((a, b) => {
    const getVal = (doc: Document & { data: T }): string => {
      if (DOC_KEYS.has(orderBy)) return String(doc[orderBy as keyof Document] ?? '');
      return String((doc.data as Record<string, unknown>)[orderBy] ?? '');
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
}

/**
 * Get all documents in a collection.
 *
 * @example
 * ```ts
 * const posts = getCollection<{ title: string; excerpt: string }>('posts');
 * const drafts = getCollection('posts', { status: 'draft' });
 * const latest = getCollection('posts', { orderBy: 'createdAt', order: 'desc', limit: 5 });
 * ```
 */
export function getCollection<T = Record<string, unknown>>(
  collection: string,
  options?: CollectionOptions,
): (Document & { data: T })[] {
  return _getCollection<T>(resolveContentDir(), collection, options);
}

/**
 * Get a single document by collection and slug.
 *
 * @example
 * ```ts
 * const post = getDocument<{ title: string; content: string }>('posts', 'hello-world');
 * if (!post) notFound();
 * ```
 */
export function getDocument<T = Record<string, unknown>>(
  collection: string,
  slug: string,
): (Document & { data: T }) | null {
  return _getDocument<T>(resolveContentDir(), collection, slug);
}

/**
 * Get a singleton document's data (e.g. global settings).
 * Returns just the `data` payload, not the full document wrapper.
 *
 * @example
 * ```ts
 * const settings = getSingleton<{ siteTitle: string }>('global');
 * ```
 */
export function getSingleton<T = Record<string, unknown>>(
  collection: string,
  slug?: string,
): T | null {
  return _getSingleton<T>(resolveContentDir(), collection, slug);
}

/**
 * List all collection directory names in the content folder.
 *
 * @example
 * ```ts
 * const collections = getCollections(); // ['posts', 'pages', 'global']
 * ```
 */
export function getCollections(): string[] {
  return _getCollections(resolveContentDir());
}

// ─── Internal implementations (shared between standalone exports and factory) ───

function _getCollection<T>(
  contentDir: string,
  collection: string,
  options?: CollectionOptions,
): (Document & { data: T })[] {
  const dir = join(contentDir, collection);
  if (!existsSync(dir)) return [];

  const status = options?.status ?? 'published';
  const orderBy = options?.orderBy ?? 'createdAt';
  const order = options?.order ?? 'desc';

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const documents: (Document & { data: T })[] = [];

  for (const file of files) {
    try {
      const doc = readDoc<T>(join(dir, file));
      if (status === 'all' || doc.status === status) {
        documents.push(doc);
      }
    } catch {
      // Skip malformed JSON files
    }
  }

  sortDocuments(documents, orderBy, order);

  if (options?.limit !== undefined && options.limit > 0) {
    return documents.slice(0, options.limit);
  }

  return documents;
}

function _getDocument<T>(
  contentDir: string,
  collection: string,
  slug: string,
): (Document & { data: T }) | null {
  const filePath = join(contentDir, collection, `${slug}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return readDoc<T>(filePath);
  } catch {
    return null;
  }
}

function _getSingleton<T>(
  contentDir: string,
  collection: string,
  slug?: string,
): T | null {
  const doc = _getDocument<T>(contentDir, collection, slug ?? collection);
  return doc?.data ?? null;
}

function _getCollections(contentDir: string): string[] {
  if (!existsSync(contentDir)) return [];
  return readdirSync(contentDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

// ─── Factory ───

export interface ContentLoader {
  getCollection: typeof getCollection;
  getDocument: typeof getDocument;
  getSingleton: typeof getSingleton;
  getCollections: typeof getCollections;
}

/**
 * Create a content loader bound to a specific content directory.
 * Useful when your content lives somewhere other than `./content`.
 *
 * @example
 * ```ts
 * const cms = createContentLoader('./data/content');
 * const posts = cms.getCollection<{ title: string }>('posts');
 * ```
 */
export function createContentLoader(contentDir?: string): ContentLoader {
  const resolved = resolveContentDir(contentDir);

  return {
    getCollection<T = Record<string, unknown>>(
      collection: string,
      options?: CollectionOptions,
    ): (Document & { data: T })[] {
      return _getCollection<T>(resolved, collection, options);
    },

    getDocument<T = Record<string, unknown>>(
      collection: string,
      slug: string,
    ): (Document & { data: T }) | null {
      return _getDocument<T>(resolved, collection, slug);
    },

    getSingleton<T = Record<string, unknown>>(
      collection: string,
      slug?: string,
    ): T | null {
      return _getSingleton<T>(resolved, collection, slug);
    },

    getCollections(): string[] {
      return _getCollections(resolved);
    },
  };
}
