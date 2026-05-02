/**
 * F136 Phase 1 — Categories collection schema.
 *
 * Hierarchical categories (via `parent` relation) so editors can build
 * trees like Clothing > Tops > T-shirts.
 */
import { defineCollection, type CollectionConfig, type FieldConfig } from '@webhouse/cms';

export interface CategoriesCollectionOptions {
  name?: string;
  label?: string;
  locales?: string[];
  sourceLocale?: string;
  extraFields?: FieldConfig[];
}

export function categoriesCollection(opts: CategoriesCollectionOptions = {}): CollectionConfig {
  const sourceLocale = opts.sourceLocale ?? opts.locales?.[0];
  const name = opts.name ?? 'categories';
  return defineCollection({
    name,
    label: opts.label ?? 'Categories',
    kind: 'data',
    ...(sourceLocale ? { sourceLocale } : {}),
    ...(opts.locales ? { locales: opts.locales } : {}),
    description:
      'Product categories. Editor-managed taxonomy — used for filtering on category pages, ' +
      'breadcrumbs, faceted search. Self-referencing parent field allows nesting.',
    fields: [
      { name: 'name',            type: 'text',     label: 'Name', required: true },
      { name: 'slug',            type: 'text',     label: 'Slug', required: true },
      { name: 'description',     type: 'textarea', label: 'Description' },
      { name: 'parent',          type: 'relation', collection: name, label: 'Parent category' },
      { name: 'image',           type: 'image',    label: 'Image' },
      { name: 'sortOrder',       type: 'number',   label: 'Sort order' },
      { name: 'metaTitle',       type: 'text',     label: 'SEO title (optional)' },
      { name: 'metaDescription', type: 'textarea', label: 'SEO description (optional)' },

      ...(opts.extraFields ?? []),
    ],
  });
}
