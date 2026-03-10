import type { Document } from '../storage/types.js';
import type { CollectionConfig } from '../schema/types.js';

export function getDocumentUrl(
  doc: Document,
  collection: CollectionConfig,
  allDocs?: Map<string, Document>,
): string {
  // If slug contains '/', it's already a hierarchical path
  if (doc.slug.includes('/')) {
    return `/${doc.slug}/`;
  }

  // If collection has urlPrefix '/', skip collection name
  const prefix = collection.urlPrefix ?? `/${collection.name}`;
  const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

  // If collection has parentField, traverse the parent chain
  if (collection.parentField && allDocs) {
    const parentId = doc.data[collection.parentField] as string | undefined;
    if (parentId) {
      const parentDoc = allDocs.get(parentId);
      if (parentDoc) {
        const parentUrl = getDocumentUrl(parentDoc, collection, allDocs);
        const parentPath = parentUrl.endsWith('/') ? parentUrl.slice(0, -1) : parentUrl;
        return `${parentPath}/${doc.slug}/`;
      }
    }
  }

  return `${cleanPrefix}/${doc.slug}/`;
}

export function getCollectionIndexUrl(collection: CollectionConfig): string {
  const prefix = collection.urlPrefix ?? `/${collection.name}`;
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}
