import type { Document, DocumentInput, WriteContext } from '../storage/types.js';

/**
 * Engine-level hooks — receive every operation across all collections.
 * Pass to ContentService constructor.
 */
export interface ContentHooks {
  beforeCreate?: (collection: string, input: DocumentInput, context?: WriteContext) => Promise<DocumentInput> | DocumentInput;
  afterCreate?: (collection: string, doc: Document, context?: WriteContext) => Promise<void> | void;
  beforeUpdate?: (collection: string, id: string, input: Partial<DocumentInput>, context?: WriteContext) => Promise<Partial<DocumentInput>> | Partial<DocumentInput>;
  afterUpdate?: (collection: string, doc: Document, context?: WriteContext) => Promise<void> | void;
  beforeDelete?: (collection: string, id: string, context?: WriteContext) => Promise<void> | void;
  afterDelete?: (collection: string, id: string, context?: WriteContext) => Promise<void> | void;
}

/**
 * Per-collection lifecycle hooks — defined on each CollectionConfig.
 * Called only for operations on that specific collection.
 */
export interface CollectionHooks {
  /** Called before a document is created. Return modified input or void to use original. */
  beforeCreate?: (input: DocumentInput, context?: WriteContext) => Promise<DocumentInput | void> | DocumentInput | void;
  /** Called after a document is created. */
  afterCreate?: (doc: Document, context?: WriteContext) => Promise<void> | void;
  /** Called before a document is updated. Return modified input or void to use original. */
  beforeUpdate?: (id: string, input: Partial<DocumentInput>, existing: Document, context?: WriteContext) => Promise<Partial<DocumentInput> | void> | Partial<DocumentInput> | void;
  /** Called after a document is updated. */
  afterUpdate?: (doc: Document, context?: WriteContext) => Promise<void> | void;
  /** Called before a document is deleted. Return false to cancel deletion. */
  beforeDelete?: (doc: Document, context?: WriteContext) => Promise<boolean | void> | boolean | void;
  /** Called after a document is deleted. */
  afterDelete?: (doc: Document, context?: WriteContext) => Promise<void> | void;
}
