import type { StorageAdapter, Document } from '../storage/types.js';
import type { CmsConfig } from '../schema/types.js';

export interface ResolveOptions {
  includeDrafts?: boolean;
}

export interface SiteContext {
  config: CmsConfig;
  collections: Record<string, Document[]>;
  includeDrafts?: boolean;
}

export async function resolveSite(config: CmsConfig, storage: StorageAdapter, options: ResolveOptions = {}): Promise<SiteContext> {
  const collections: Record<string, Document[]> = {};

  for (const collection of config.collections) {
    // Always include published documents
    const { documents: published } = await storage.findMany(collection.name, {
      status: 'published',
      limit: 10000,
    });
    collections[collection.name] = published;

    // Optionally include drafts
    if (options.includeDrafts) {
      const { documents: drafts } = await storage.findMany(collection.name, {
        status: 'draft',
        limit: 10000,
      });
      collections[collection.name] = [...published, ...drafts];
    }
  }

  return { config, collections, includeDrafts: options.includeDrafts };
}
