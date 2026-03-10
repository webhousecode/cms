import type { StorageAdapter, Document } from '../storage/types.js';
import type { CmsConfig } from '../schema/types.js';

export interface SiteContext {
  config: CmsConfig;
  collections: Record<string, Document[]>;
}

export async function resolveSite(config: CmsConfig, storage: StorageAdapter): Promise<SiteContext> {
  const collections: Record<string, Document[]> = {};

  for (const collection of config.collections) {
    const { documents } = await storage.findMany(collection.name, {
      status: 'published',
      limit: 10000,
    });
    collections[collection.name] = documents;
  }

  return { config, collections };
}
