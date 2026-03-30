/**
 * F79 — Site Config Validator
 *
 * Deep validation of cms.config.ts and content/ structure
 * with human-readable error messages and fix suggestions.
 */
import { VALID_FIELD_TYPES } from './validate.js';

export interface ValidationIssue {
  level: 'error' | 'warning';
  category: 'config' | 'content' | 'structure';
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Levenshtein distance for typo suggestions */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  // Initialize (m+1) x (n+1) matrix
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    const row: number[] = [];
    for (let j = 0; j <= n; j++) row.push(j === 0 ? i : 0);
    dp.push(row);
  }
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function suggestFieldType(invalid: string): string | undefined {
  let best = '';
  let bestDist = Infinity;
  for (const t of VALID_FIELD_TYPES) {
    const d = levenshtein(invalid.toLowerCase(), t.toLowerCase());
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return bestDist <= 3 ? best : undefined;
}

/**
 * Validate a CMS config object (already loaded/parsed).
 * Does NOT throw — returns structured ValidationResult.
 */
export function validateSiteConfig(config: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!config || typeof config !== 'object') {
    errors.push({ level: 'error', category: 'config', path: '', message: 'Config is not an object. Make sure cms.config.ts exports a valid config via defineConfig().' });
    return { valid: false, errors, warnings };
  }

  const cfg = config as Record<string, unknown>;

  // --- Collections ---
  if (!cfg.collections || !Array.isArray(cfg.collections)) {
    errors.push({ level: 'error', category: 'config', path: 'collections', message: 'Missing "collections" array. At least one collection is required.' });
    return { valid: false, errors, warnings };
  }

  if (cfg.collections.length === 0) {
    errors.push({ level: 'error', category: 'config', path: 'collections', message: 'No collections defined. Add at least one collection with defineCollection().' });
  }

  const collectionNames = new Set<string>();

  for (let ci = 0; ci < cfg.collections.length; ci++) {
    const col = cfg.collections[ci] as Record<string, unknown>;
    const colPath = `collections[${ci}]`;

    // Name
    if (!col.name || typeof col.name !== 'string') {
      errors.push({ level: 'error', category: 'config', path: `${colPath}.name`, message: `Collection at index ${ci} has no name.` });
      continue;
    }

    const colName = col.name as string;

    // Duplicate names
    if (collectionNames.has(colName)) {
      errors.push({ level: 'error', category: 'config', path: `${colPath}.name`, message: `Duplicate collection name "${colName}".` });
    }
    collectionNames.add(colName);

    // Reserved collection names/labels — conflict with CMS admin built-in UI
    const RESERVED_NAMES = ['site-settings', 'site settings', 'settings', 'config', 'admin', 'media', 'interactives'];
    const colLabel = (col.label as string || '').toLowerCase();
    if (RESERVED_NAMES.includes(colName.toLowerCase()) || RESERVED_NAMES.includes(colLabel)) {
      const badName = RESERVED_NAMES.includes(colName.toLowerCase()) ? colName : col.label as string;
      warnings.push({
        level: 'warning',
        category: 'config',
        path: `${colPath}.name`,
        message: `Collection "${badName}" uses a reserved name that conflicts with CMS admin's built-in "${badName}" panel. This will confuse editors.`,
        suggestion: `Rename to "globals" (for site-wide settings) or another non-reserved name. Reserved names: ${RESERVED_NAMES.join(', ')}.`,
      });
    }

    // Invalid name characters
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(colName)) {
      errors.push({ level: 'error', category: 'config', path: `${colPath}.name`, message: `Collection name "${colName}" contains invalid characters. Use lowercase letters, numbers, and hyphens.`, suggestion: colName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') });
    }

    // urlPrefix for pages
    if (colName === 'pages' && !col.urlPrefix) {
      warnings.push({ level: 'warning', category: 'config', path: `${colPath}.urlPrefix`, message: `Collection "pages" has no urlPrefix. Pages won't be counted in the dashboard.`, suggestion: `Add urlPrefix: '/' to the pages collection.` });
    }

    // Fields
    if (!col.fields || !Array.isArray(col.fields)) {
      errors.push({ level: 'error', category: 'config', path: `${colPath}.fields`, message: `Collection "${colName}" has no fields array.` });
      continue;
    }

    if ((col.fields as unknown[]).length === 0) {
      errors.push({ level: 'error', category: 'config', path: `${colPath}.fields`, message: `Collection "${colName}" has no fields. Add at least one field.` });
    }

    const fieldNames = new Set<string>();
    validateFields(col.fields as unknown[], `${colPath}.fields`, colName, fieldNames, errors, warnings);
  }

  // --- Blocks ---
  if (cfg.blocks && Array.isArray(cfg.blocks)) {
    const blockNames = new Set<string>();
    for (let bi = 0; bi < cfg.blocks.length; bi++) {
      const block = cfg.blocks[bi] as Record<string, unknown>;
      const bPath = `blocks[${bi}]`;

      if (!block.name || typeof block.name !== 'string') {
        errors.push({ level: 'error', category: 'config', path: `${bPath}.name`, message: `Block at index ${bi} has no name.` });
        continue;
      }

      if (blockNames.has(block.name as string)) {
        errors.push({ level: 'error', category: 'config', path: `${bPath}.name`, message: `Duplicate block name "${block.name}".` });
      }
      blockNames.add(block.name as string);

      if (!block.fields || !Array.isArray(block.fields) || (block.fields as unknown[]).length === 0) {
        errors.push({ level: 'error', category: 'config', path: `${bPath}.fields`, message: `Block "${block.name}" has no fields.` });
      } else {
        validateFields(block.fields as unknown[], `${bPath}.fields`, block.name as string, new Set(), errors, warnings);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateFields(
  fields: unknown[],
  basePath: string,
  parentName: string,
  fieldNames: Set<string>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  for (let fi = 0; fi < fields.length; fi++) {
    const field = fields[fi] as Record<string, unknown>;
    const fPath = `${basePath}[${fi}]`;

    if (!field || typeof field !== 'object') {
      errors.push({ level: 'error', category: 'config', path: fPath, message: `Field at index ${fi} in "${parentName}" is not an object.` });
      continue;
    }

    // Name
    if (!field.name || typeof field.name !== 'string') {
      errors.push({ level: 'error', category: 'config', path: `${fPath}.name`, message: `Field at index ${fi} in "${parentName}" has no name.` });
      continue;
    }

    const fname = field.name as string;

    // Duplicate field names
    if (fieldNames.has(fname)) {
      errors.push({ level: 'error', category: 'config', path: `${fPath}.name`, message: `Duplicate field name "${fname}" in "${parentName}".` });
    }
    fieldNames.add(fname);

    // Type
    if (!field.type || typeof field.type !== 'string') {
      errors.push({ level: 'error', category: 'config', path: `${fPath}.type`, message: `Field "${fname}" in "${parentName}" has no type.` });
      continue;
    }

    const ftype = field.type as string;
    if (!VALID_FIELD_TYPES.includes(ftype as typeof VALID_FIELD_TYPES[number])) {
      const suggestion = suggestFieldType(ftype);
      const issue: ValidationIssue = {
        level: 'error', category: 'config', path: `${fPath}.type`,
        message: `Invalid field type "${ftype}" on field "${fname}" in "${parentName}". Valid types: ${VALID_FIELD_TYPES.join(', ')}.`,
      };
      if (suggestion) issue.suggestion = `Did you mean "${suggestion}"?`;
      errors.push(issue);
    }

    // Array/object must have sub-fields
    if ((ftype === 'array' || ftype === 'object') && (!field.fields || !Array.isArray(field.fields) || (field.fields as unknown[]).length === 0)) {
      errors.push({ level: 'error', category: 'config', path: `${fPath}.fields`, message: `${ftype === 'array' ? 'Array' : 'Object'} field "${fname}" in "${parentName}" is missing "fields" definition.` });
    }

    // Select must have options
    if (ftype === 'select' && (!field.options || !Array.isArray(field.options) || (field.options as unknown[]).length === 0)) {
      errors.push({ level: 'error', category: 'config', path: `${fPath}.options`, message: `Select field "${fname}" in "${parentName}" is missing "options" array.` });
    }

    // Relation must have collection
    if (ftype === 'relation' && !field.collection) {
      errors.push({ level: 'error', category: 'config', path: `${fPath}.collection`, message: `Relation field "${fname}" in "${parentName}" is missing "collection" reference.` });
    }

    // Recurse into nested fields
    if (field.fields && Array.isArray(field.fields)) {
      validateFields(field.fields as unknown[], `${fPath}.fields`, fname, new Set(), errors, warnings);
    }
  }
}

/**
 * Validate content directory structure against config.
 */
export async function validateContentDir(
  contentDir: string,
  collections: Array<{ name: string; fields?: unknown[] }>,
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Dynamic import to avoid bundling fs in browser
  const fs = await import('fs/promises');
  const path = await import('path');

  // Check content dir exists
  try {
    await fs.access(contentDir);
  } catch {
    errors.push({ level: 'error', category: 'structure', path: contentDir, message: `Content directory "${contentDir}" does not exist.`, suggestion: `Create it with: mkdir -p ${contentDir}` });
    return { valid: false, errors, warnings };
  }

  for (const col of collections) {
    const colDir = path.join(contentDir, col.name);
    try {
      await fs.access(colDir);
    } catch {
      warnings.push({ level: 'warning', category: 'structure', path: colDir, message: `No content directory for collection "${col.name}".`, suggestion: `Create it: mkdir -p ${colDir}` });
      continue;
    }

    // Check JSON files
    const entries = await fs.readdir(colDir).catch(() => [] as string[]);
    const jsonFiles = entries.filter((f: string) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      warnings.push({ level: 'warning', category: 'content', path: colDir, message: `Collection "${col.name}" has no documents (0 JSON files).` });
      continue;
    }

    // Validate a sample of documents (max 5 to keep it fast)
    const sample = jsonFiles.slice(0, 5);
    for (const file of sample) {
      const filePath = path.join(colDir, file);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const doc = JSON.parse(raw);

        if (!doc.slug) {
          errors.push({ level: 'error', category: 'content', path: filePath, message: `Document "${file}" is missing "slug" field.` });
        }
        if (!doc.status) {
          errors.push({ level: 'error', category: 'content', path: filePath, message: `Document "${file}" is missing "status" field.`, suggestion: 'Add "status": "draft" or "status": "published".' });
        } else if (!['draft', 'published', 'archived', 'expired', 'trashed'].includes(doc.status)) {
          errors.push({ level: 'error', category: 'content', path: filePath, message: `Document "${file}" has invalid status "${doc.status}".`, suggestion: 'Valid: draft, published, archived, expired.' });
        }
        if (doc.data === undefined) {
          errors.push({ level: 'error', category: 'content', path: filePath, message: `Document "${file}" is missing "data" object.` });
        }

        // Check slug matches filename
        const expectedSlug = file.replace('.json', '');
        if (doc.slug && doc.slug !== expectedSlug) {
          warnings.push({ level: 'warning', category: 'content', path: filePath, message: `Document "${file}" has slug "${doc.slug}" that doesn't match filename. Expected "${expectedSlug}".` });
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          errors.push({ level: 'error', category: 'content', path: filePath, message: `Document "${file}" contains invalid JSON: ${err.message}` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Run both config and content validation.
 */
export async function validateSite(
  config: unknown,
  contentDir?: string,
): Promise<ValidationResult> {
  const configResult = validateSiteConfig(config);

  if (!contentDir || configResult.errors.length > 0) {
    return configResult;
  }

  const cfg = config as { collections: Array<{ name: string; fields?: unknown[] }> };
  const contentResult = await validateContentDir(contentDir, cfg.collections);

  return {
    valid: configResult.valid && contentResult.valid,
    errors: [...configResult.errors, ...contentResult.errors],
    warnings: [...configResult.warnings, ...contentResult.warnings],
  };
}
