import type { CmsConfig, CollectionConfig, FieldConfig } from './types.js';

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
  enum?: string[];
  format?: string;
  minLength?: number;
  maxLength?: number;
  required?: string[];
}

export interface CollectionJsonSchema {
  $schema: string;
  title: string;
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

function fieldToJsonSchema(field: FieldConfig): JsonSchemaProperty {
  const base: JsonSchemaProperty = {
    description: field.label ?? field.name,
  };

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'richtext': {
      const prop: JsonSchemaProperty = { ...base, type: 'string' };
      if (field.minLength !== undefined) prop.minLength = field.minLength;
      if (field.maxLength !== undefined) prop.maxLength = field.maxLength;
      return prop;
    }
    case 'number':
      return { ...base, type: 'number' };
    case 'boolean':
      return { ...base, type: 'boolean' };
    case 'date':
      return { ...base, type: 'string', format: 'date-time' };
    case 'image':
      return { ...base, type: 'string', format: 'uri', description: 'Image URL or path' };
    case 'select': {
      const prop: JsonSchemaProperty = { ...base, type: 'string' };
      if (field.options) prop.enum = field.options.map(o => o.value);
      return prop;
    }
    case 'relation':
      return { ...base, type: 'string', description: `Reference to ${field.collection ?? 'unknown'} collection` };
    case 'array':
      return {
        ...base,
        type: 'array',
        items: field.fields?.[0] ? fieldToJsonSchema(field.fields[0]) : { type: 'string' },
      };
    case 'object':
      if (field.fields) {
        const properties: Record<string, JsonSchemaProperty> = {};
        for (const f of field.fields) {
          properties[f.name] = fieldToJsonSchema(f);
        }
        return { ...base, type: 'object', properties };
      }
      return { ...base, type: 'object' };
    case 'blocks':
      return { ...base, type: 'array', items: { type: 'object' } };
    default:
      return { ...base, type: 'string' };
  }
}

export function collectionToJsonSchema(collection: CollectionConfig): CollectionJsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const field of collection.fields) {
    properties[field.name] = fieldToJsonSchema(field);
    if (field.required === true) {
      required.push(field.name);
    }
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: collection.label ?? collection.name,
    type: 'object',
    properties,
    required,
  };
}

export function configToManifest(config: CmsConfig) {
  return {
    version: '0.1.0',
    collections: config.collections.map(c => ({
      name: c.name,
      label: c.label ?? c.name,
      slug: c.slug ?? c.name,
      fields: c.fields,
      schema: collectionToJsonSchema(c),
    })),
    blocks: config.blocks ?? [],
    api: {
      rest: {
        prefix: config.api?.prefix ?? '/api',
        endpoints: config.collections.flatMap(c => [
          { method: 'GET', path: `/api/content/${c.name}`, description: `List ${c.name}` },
          { method: 'GET', path: `/api/content/${c.name}/:slug`, description: `Get ${c.name} by slug` },
          { method: 'POST', path: `/api/content/${c.name}`, description: `Create ${c.name}` },
          { method: 'PUT', path: `/api/content/${c.name}/:slug`, description: `Update ${c.name}` },
          { method: 'DELETE', path: `/api/content/${c.name}/:slug`, description: `Delete ${c.name}` },
        ]),
      },
    },
    ai: {
      agents: ['content', 'seo'],
      capabilities: {
        content: ['generate', 'rewrite', 'translate', 'seo-optimize', 'expand'],
        seo: ['meta-tags', 'json-ld', 'sitemap'],
      },
      note: 'Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable AI features',
    },
  };
}
