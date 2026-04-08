/**
 * F125 Phase 1 — Schema Export
 *
 * Convert a CmsConfig to a JSON Schema (draft 2020-12) document so non-TypeScript
 * runtimes (PHP, Python, Ruby, Go, Java, C#) can introspect the content model.
 *
 * The output uses `x-webhouse-*` extension keywords for metadata that has no
 * native JSON Schema equivalent (richtext, tags, blocks, etc.). Reader libraries
 * use these hints to render appropriately.
 */
import type {
  CmsConfig,
  CollectionConfig,
  BlockConfig,
  FieldConfig,
  FieldType,
} from './types.js';

export interface JsonSchemaOutput {
  $schema: string;
  $id?: string;
  title: string;
  description?: string;
  'x-webhouse-version': string;
  'x-generated-at': string;
  $defs: Record<string, unknown>;
  collections: Record<string, unknown>;
  blocks?: Record<string, unknown>;
}

export interface ToJsonSchemaOptions {
  /** Optional base URL used for the `$id` field. */
  baseUrl?: string;
  /** Title for the schema (default: "Webhouse Content Schema"). */
  title?: string;
  /** Description for the schema. */
  description?: string;
  /** Include block definitions (default: true). */
  includeBlocks?: boolean;
  /** Library version stamp (default: "0.3.0"). */
  version?: string;
  /** Override the generation timestamp (testing). */
  generatedAt?: string;
}

const DEFAULT_VERSION = '0.3.0';

/**
 * Convert a CmsConfig to a JSON Schema document.
 */
export function toJsonSchema(
  config: CmsConfig,
  options: ToJsonSchemaOptions = {},
): JsonSchemaOutput {
  const {
    baseUrl,
    title = 'Webhouse Content Schema',
    description,
    includeBlocks = true,
    version = DEFAULT_VERSION,
    generatedAt = new Date().toISOString(),
  } = options;

  const output: JsonSchemaOutput = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title,
    'x-webhouse-version': version,
    'x-generated-at': generatedAt,
    $defs: {
      Document: buildDocumentDef(),
    },
    collections: {},
  };

  if (baseUrl) {
    output.$id = `${baseUrl.replace(/\/+$/, '')}/webhouse-schema.json`;
  }
  if (description) {
    output.description = description;
  }

  for (const collection of config.collections) {
    output.collections[collection.name] = collectionToSchema(collection);
  }

  if (includeBlocks && config.blocks && config.blocks.length > 0) {
    output.blocks = {};
    for (const block of config.blocks) {
      output.blocks[block.name] = blockToSchema(block);
    }
  }

  return output;
}

/**
 * The shared Document base — every collection extends this.
 */
function buildDocumentDef(): Record<string, unknown> {
  return {
    type: 'object',
    description: 'Base document fields shared by every @webhouse/cms document',
    required: ['slug', 'status', 'data'],
    properties: {
      slug: {
        type: 'string',
        pattern: '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$',
        description: 'Document slug — must match the JSON filename without extension',
      },
      status: {
        enum: ['draft', 'published', 'archived', 'expired', 'trashed'],
        description: 'Publication status. Readers should filter to "published" by default.',
      },
      locale: {
        type: 'string',
        description: 'BCP 47 locale tag (e.g. "en", "da", "de-AT"). Optional.',
      },
      translationGroup: {
        type: 'string',
        format: 'uuid',
        description: 'Shared UUID linking all translations of this document',
      },
      id: {
        type: 'string',
        description: 'Stable internal identifier',
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
      },
      updatedAt: {
        type: 'string',
        format: 'date-time',
      },
      _fieldMeta: {
        type: 'object',
        description: 'Internal field metadata (locks, generation hints). Treat as opaque.',
      },
    },
  };
}

/**
 * Convert a single collection to a JSON Schema object.
 */
function collectionToSchema(collection: CollectionConfig): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    allOf: [{ $ref: '#/$defs/Document' }],
    'x-webhouse-collection': {
      name: collection.name,
      label: collection.label ?? collection.name,
      kind: collection.kind ?? 'page',
      urlPrefix: collection.urlPrefix,
      urlPattern: collection.urlPattern,
      parentField: collection.parentField,
      translatable: collection.translatable ?? true,
      previewable: collection.previewable ?? true,
      sourceLocale: collection.sourceLocale,
      locales: collection.locales,
      description: collection.description,
    },
    properties: {
      data: dataObjectFromFields(collection.fields),
    },
  };

  // Strip undefined values from x-webhouse-collection for cleaner output
  const meta = schema['x-webhouse-collection'] as Record<string, unknown>;
  for (const key of Object.keys(meta)) {
    if (meta[key] === undefined) delete meta[key];
  }

  return schema;
}

/**
 * Convert a block definition to a JSON Schema object.
 */
function blockToSchema(block: BlockConfig): Record<string, unknown> {
  return {
    type: 'object',
    'x-webhouse-block': {
      name: block.name,
      label: block.label ?? block.name,
      propertyFields: block.propertyFields,
    },
    required: ['_block'],
    properties: {
      _block: {
        const: block.name,
        description: 'Block type discriminator',
      },
      ...fieldsToProperties(block.fields),
    },
  };
}

/**
 * Build the `data` object schema from a list of field definitions.
 */
function dataObjectFromFields(fields: FieldConfig[]): Record<string, unknown> {
  const required = fields.filter((f) => f.required).map((f) => f.name);
  return {
    type: 'object',
    properties: fieldsToProperties(fields),
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Map a list of field definitions to a `properties` object.
 */
function fieldsToProperties(fields: FieldConfig[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const field of fields) {
    props[field.name] = fieldToSchema(field);
  }
  return props;
}

/**
 * Convert a single field to its JSON Schema representation.
 *
 * Native JSON Schema doesn't have first-class concepts for "richtext", "tags",
 * "image", "blocks", etc. — we use `x-webhouse-field-type` to preserve the
 * semantic meaning so reader libraries can render appropriately.
 */
export function fieldToSchema(field: FieldConfig): Record<string, unknown> {
  const base: Record<string, unknown> = {
    'x-webhouse-field-type': field.type,
    description: field.label ?? field.name,
  };

  if (field.ai?.hint) {
    base['x-webhouse-ai-hint'] = field.ai.hint;
  }

  switch (field.type) {
    case 'text':
      return {
        ...base,
        type: 'string',
        ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
      };

    case 'textarea':
      return {
        ...base,
        type: 'string',
        ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
      };

    case 'richtext':
      return {
        ...base,
        type: 'string',
        contentMediaType: 'text/markdown',
        ...(field.features ? { 'x-webhouse-richtext-features': field.features } : {}),
      };

    case 'htmldoc':
      return {
        ...base,
        type: 'string',
        contentMediaType: 'text/html',
      };

    case 'number':
      return {
        ...base,
        type: 'number',
      };

    case 'boolean':
      return {
        ...base,
        type: 'boolean',
      };

    case 'date':
      return {
        ...base,
        type: 'string',
        format: 'date',
      };

    case 'image':
      return {
        ...base,
        type: 'string',
        description: `${field.label ?? field.name} — URL path to image (typically /uploads/...)`,
      };

    case 'video':
    case 'audio':
    case 'file':
      return {
        ...base,
        type: 'string',
        description: `${field.label ?? field.name} — URL path to ${field.type}`,
      };

    case 'tags':
      return {
        ...base,
        type: 'array',
        items: { type: 'string' },
      };

    case 'select':
      return {
        ...base,
        type: 'string',
        ...(field.options ? { enum: field.options.map((o) => o.value) } : {}),
        ...(field.options ? { 'x-webhouse-options': field.options } : {}),
      };

    case 'array':
      return {
        ...base,
        type: 'array',
        items: field.fields
          ? {
              type: 'object',
              properties: fieldsToProperties(field.fields),
            }
          : { type: 'object' },
      };

    case 'object':
      return {
        ...base,
        type: 'object',
        ...(field.fields ? { properties: fieldsToProperties(field.fields) } : {}),
      };

    case 'blocks':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'object',
          required: ['_block'],
          properties: {
            _block: { type: 'string', description: 'Block type discriminator' },
          },
          additionalProperties: true,
        },
        ...(field.blocks ? { 'x-webhouse-allowed-blocks': field.blocks } : {}),
      };

    case 'relation':
      return {
        ...base,
        ...(field.multiple
          ? { type: 'array', items: { type: 'string' } }
          : { type: 'string' }),
        'x-webhouse-relation': {
          collection: field.collection,
          multiple: field.multiple ?? false,
        },
      };

    case 'image-gallery':
      return {
        ...base,
        type: 'array',
        items: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'Image URL path' },
            alt: { type: 'string', description: 'Alt text' },
          },
        },
      };

    case 'interactive':
      return {
        ...base,
        type: 'string',
        description: `${field.label ?? field.name} — interactive ID reference`,
      };

    case 'column-slots':
      return {
        ...base,
        type: 'object',
        description: 'Column slot definition (multi-column layout)',
        additionalProperties: true,
      };

    case 'map':
      return {
        ...base,
        type: 'object',
        description: 'Geographic point — { lat, lng }',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      };

    default: {
      // Exhaustiveness check — if a new field type is added without updating
      // this switch, the next line becomes a TypeScript error.
      const _exhaustive: never = field.type;
      void _exhaustive;
      return base;
    }
  }
}
