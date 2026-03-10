import type { Document, DocumentInput, WriteContext } from '../storage/types.js';

export interface ContentHooks {
  beforeCreate?: (collection: string, input: DocumentInput, context?: WriteContext) => Promise<DocumentInput> | DocumentInput;
  afterCreate?: (collection: string, doc: Document, context?: WriteContext) => Promise<void> | void;
  beforeUpdate?: (collection: string, id: string, input: Partial<DocumentInput>, context?: WriteContext) => Promise<Partial<DocumentInput>> | Partial<DocumentInput>;
  afterUpdate?: (collection: string, doc: Document, context?: WriteContext) => Promise<void> | void;
  beforeDelete?: (collection: string, id: string, context?: WriteContext) => Promise<void> | void;
  afterDelete?: (collection: string, id: string, context?: WriteContext) => Promise<void> | void;
}
