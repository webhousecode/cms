import { z } from 'zod';
import type { CmsConfig } from './types.js';

const fieldTypeSchema = z.enum([
  'text', 'textarea', 'richtext', 'number', 'boolean',
  'date', 'image', 'relation', 'array', 'object', 'blocks', 'select', 'tags',
  'image-gallery', 'video',
]);

const fieldConfigSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: fieldTypeSchema,
    label: z.string().optional(),
    required: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
    maxLength: z.number().optional(),
    minLength: z.number().optional(),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    collection: z.string().optional(),
    fields: z.array(fieldConfigSchema).optional(),
    blocks: z.array(z.string()).optional(),
    ai: z.object({
      hint: z.string().optional(),
      maxLength: z.number().optional(),
      tone: z.string().optional(),
    }).optional(),
    aiLock: z.object({
      autoLockOnEdit: z.boolean().optional(),
      lockable: z.boolean().optional(),
      requireApproval: z.boolean().optional(),
    }).optional(),
  })
);

const collectionConfigSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  slug: z.string().optional(),
  urlPrefix: z.string().optional(),
  parentField: z.string().optional(),
  fields: z.array(fieldConfigSchema).min(1),
  hooks: z.object({
    beforeCreate: z.string().optional(),
    afterCreate: z.string().optional(),
    beforeUpdate: z.string().optional(),
    afterUpdate: z.string().optional(),
    beforeDelete: z.string().optional(),
    afterDelete: z.string().optional(),
  }).optional(),
});

const cmsConfigSchema = z.object({
  collections: z.array(collectionConfigSchema).min(1),
  blocks: z.array(z.object({
    name: z.string(),
    label: z.string().optional(),
    fields: z.array(fieldConfigSchema),
  })).optional(),
  storage: z.object({
    adapter: z.enum(['sqlite', 'filesystem', 'github']).optional(),
    sqlite: z.object({ path: z.string().optional() }).optional(),
    filesystem: z.object({ contentDir: z.string().optional() }).optional(),
    github: z.object({
      owner: z.string(),
      repo: z.string(),
      branch: z.string().optional(),
      contentDir: z.string().optional(),
      token: z.string(),
    }).optional(),
  }).optional(),
  build: z.object({
    outDir: z.string().optional(),
    baseUrl: z.string().optional(),
  }).optional(),
  api: z.object({
    port: z.number().optional(),
    prefix: z.string().optional(),
  }).optional(),
});

export function validateConfig(config: unknown): CmsConfig {
  return cmsConfigSchema.parse(config) as CmsConfig;
}

export function safeValidateConfig(config: unknown): { success: true; data: CmsConfig } | { success: false; error: z.ZodError } {
  const result = cmsConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as CmsConfig };
  }
  return { success: false, error: result.error };
}
