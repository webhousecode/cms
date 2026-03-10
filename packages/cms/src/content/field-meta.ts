import { now } from '../utils/date.js';
import type { DocumentFieldMeta, FieldMeta, WriteContext } from '../storage/types.js';

export function isFieldLocked(meta: DocumentFieldMeta, fieldPath: string): boolean {
  return !!meta[fieldPath]?.lockedBy;
}

export function getLockedFields(meta: DocumentFieldMeta): string[] {
  return Object.keys(meta).filter(k => !!meta[k]?.lockedBy);
}

export function filterUnlockedFields(meta: DocumentFieldMeta, fieldPaths: string[]): string[] {
  return fieldPaths.filter(f => !isFieldLocked(meta, f));
}

export interface FieldMetaChanges {
  filteredData: Record<string, unknown>;
  updatedMeta: DocumentFieldMeta;
  skippedFields: string[];
}

/**
 * Computes which fields to write and how to update _fieldMeta based on the WriteContext.
 *
 * Rules:
 * - actor='ai' + field locked → skip field (AI cannot overwrite human edits)
 * - actor='user' + field was AI-generated → write + auto-lock
 * - actor='user' + field not AI-generated → write, no meta change
 * - actor='ai' + field unlocked → write + mark as aiGenerated
 * - actor='import' → write + lock with reason 'import'
 */
export function computeFieldMetaChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  existingMeta: DocumentFieldMeta,
  context: WriteContext,
): FieldMetaChanges {
  const timestamp = now();
  const updatedMeta: DocumentFieldMeta = { ...existingMeta };
  const filteredData: Record<string, unknown> = {};
  const skippedFields: string[] = [];

  for (const [field, value] of Object.entries(newData)) {
    const hasChanged = JSON.stringify(oldData[field]) !== JSON.stringify(value);
    const fieldMeta = updatedMeta[field] ?? {};
    const isLocked = !!fieldMeta.lockedBy;

    if (!hasChanged) {
      // No change — pass through without touching meta
      filteredData[field] = value;
      continue;
    }

    if (context.actor === 'ai' && isLocked) {
      // AI cannot overwrite a locked field
      skippedFields.push(field);
    } else if (context.actor === 'user') {
      filteredData[field] = value;
      if (fieldMeta.aiGenerated) {
        // User is editing an AI-generated field → auto-lock
        const locked: Partial<FieldMeta> = {
          ...fieldMeta,
          lockedBy: 'user',
          lockedAt: timestamp,
          reason: 'user-edit',
        };
        if (context.userId !== undefined) locked.userId = context.userId;
        updatedMeta[field] = locked;
      }
      // No meta change for fields that were never AI-generated
    } else if (context.actor === 'ai') {
      // AI writing to an unlocked field → mark as AI-generated
      // We build a clean meta without lock fields (omit them rather than set to undefined)
      const aiMeta: Partial<FieldMeta> = {
        aiGenerated: true,
        aiGeneratedAt: timestamp,
      };
      if (context.aiModel !== undefined) aiMeta.aiModel = context.aiModel;
      updatedMeta[field] = aiMeta;
      filteredData[field] = value;
    } else if (context.actor === 'import') {
      filteredData[field] = value;
      const importMeta: Partial<FieldMeta> = {
        ...fieldMeta,
        lockedBy: 'import',
        lockedAt: timestamp,
        reason: 'import',
      };
      if (context.userId !== undefined) importMeta.userId = context.userId;
      updatedMeta[field] = importMeta;
    }
  }

  return { filteredData, updatedMeta, skippedFields };
}

/**
 * Builds _fieldMeta for a newly created document.
 * All fields are marked as AI-generated when actor='ai'.
 */
export function buildInitialFieldMeta(
  data: Record<string, unknown>,
  context: WriteContext,
): DocumentFieldMeta {
  if (context.actor !== 'ai') return {};

  const timestamp = now();
  const meta: DocumentFieldMeta = {};
  for (const field of Object.keys(data)) {
    const fieldMeta: Partial<FieldMeta> = {
      aiGenerated: true,
      aiGeneratedAt: timestamp,
    };
    if (context.aiModel !== undefined) fieldMeta.aiModel = context.aiModel;
    meta[field] = fieldMeta;
  }
  return meta;
}
