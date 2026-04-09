/**
 * F02 — Import Engine.
 *
 * Generic import pipeline: parse file (CSV/JSON/Markdown), map fields to
 * collection schema, validate, and batch-create documents via CMS API.
 */
import Papa from "papaparse";
import matter from "gray-matter";
import { randomUUID } from "node:crypto";

// ── Types ──

export type ImportFormat = "csv" | "json" | "markdown";

export interface FieldMapping {
  /** Source column/key name */
  sourceField: string;
  /** Target CMS field name */
  targetField: string;
  /** Optional transform */
  transform?: "none" | "slugify" | "date-iso" | "markdown-to-html" | "split-comma" | "number" | "boolean";
}

export interface ImportPreviewRow {
  rowIndex: number;
  sourceData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  slug: string;
  errors: Array<{ field: string; message: string }>;
  valid: boolean;
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

// ── Parsing ──

/**
 * Parse an uploaded file and extract records + detected field names.
 */
export function parseFile(
  content: string,
  format: ImportFormat,
  fileName?: string,
): { records: Record<string, unknown>[]; fields: string[] } {
  switch (format) {
    case "csv":
      return parseCsv(content);
    case "json":
      return parseJson(content);
    case "markdown":
      return parseMarkdown(content, fileName);
  }
}

function parseCsv(content: string): { records: Record<string, unknown>[]; fields: string[] } {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const fields = result.meta.fields ?? [];
  return { records: result.data, fields };
}

function parseJson(content: string): { records: Record<string, unknown>[]; fields: string[] } {
  const parsed = JSON.parse(content);

  // Array of objects
  if (Array.isArray(parsed)) {
    const fields = new Set<string>();
    for (const item of parsed) {
      if (typeof item === "object" && item) {
        for (const key of Object.keys(item)) fields.add(key);
      }
    }
    return { records: parsed, fields: [...fields] };
  }

  // CMS-style: { data: [...] } or { documents: [...] } or { items: [...] }
  for (const key of ["data", "documents", "items", "records", "entries", "posts"]) {
    if (Array.isArray(parsed[key])) {
      return parseJson(JSON.stringify(parsed[key]));
    }
  }

  // Single object — wrap in array
  if (typeof parsed === "object" && parsed) {
    return { records: [parsed], fields: Object.keys(parsed) };
  }

  throw new Error("JSON must be an array of objects or an object with a data/items/documents array");
}

function parseMarkdown(content: string, fileName?: string): { records: Record<string, unknown>[]; fields: string[] } {
  // Each markdown file = one record. Frontmatter → fields, body → "content" field.
  const { data: frontmatter, content: body } = matter(content);
  const record: Record<string, unknown> = {
    ...frontmatter,
    content: body.trim(),
  };
  if (fileName) {
    record._fileName = fileName.replace(/\.md$/i, "");
  }
  const fields = Object.keys(record);
  return { records: [record], fields };
}

/**
 * Parse multiple markdown files into a single records array.
 */
export function parseMarkdownFiles(
  files: Array<{ name: string; content: string }>,
): { records: Record<string, unknown>[]; fields: string[] } {
  const allFields = new Set<string>();
  const records: Record<string, unknown>[] = [];

  for (const file of files) {
    const { records: recs, fields } = parseMarkdown(file.content, file.name);
    records.push(...recs);
    for (const f of fields) allFields.add(f);
  }

  return { records, fields: [...allFields] };
}

// ── Auto-detect format ──

export function detectFormat(fileName: string): ImportFormat {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "json") return "json";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "json"; // default
}

// ── Field Mapping ──

/**
 * Apply field mappings to parsed records → produce CMS-ready document data.
 */
export function applyMappings(
  records: Record<string, unknown>[],
  mappings: FieldMapping[],
  titleField: string,
): ImportPreviewRow[] {
  return records.map((sourceData, rowIndex) => {
    const mappedData: Record<string, unknown> = {};
    const errors: Array<{ field: string; message: string }> = [];

    for (const mapping of mappings) {
      const raw = sourceData[mapping.sourceField];
      if (raw === undefined || raw === null || raw === "") continue;

      try {
        mappedData[mapping.targetField] = applyTransform(raw, mapping.transform ?? "none");
      } catch (err) {
        errors.push({
          field: mapping.targetField,
          message: err instanceof Error ? err.message : "Transform failed",
        });
      }
    }

    // Generate slug from title field
    const titleValue = String(mappedData[titleField] ?? sourceData[titleField] ?? `row-${rowIndex + 1}`);
    const slug = slugify(titleValue);

    return {
      rowIndex,
      sourceData,
      mappedData,
      slug,
      errors,
      valid: errors.length === 0 && !!mappedData[titleField],
    };
  });
}

function applyTransform(value: unknown, transform: FieldMapping["transform"]): unknown {
  const str = String(value);
  switch (transform) {
    case "none":
      return value;
    case "slugify":
      return slugify(str);
    case "date-iso": {
      const d = new Date(str);
      if (isNaN(d.getTime())) throw new Error(`Invalid date: ${str}`);
      return d.toISOString();
    }
    case "markdown-to-html":
      // Keep as markdown — CMS richtext fields accept markdown
      return str;
    case "split-comma":
      return str.split(",").map((s) => s.trim()).filter(Boolean);
    case "number": {
      const n = Number(str);
      if (isNaN(n)) throw new Error(`Not a number: ${str}`);
      return n;
    }
    case "boolean":
      return str === "true" || str === "1" || str === "yes";
    default:
      return value;
  }
}

// ── Auto-mapping ──

/**
 * Suggest field mappings by matching source fields to collection schema fields.
 * Uses exact match, lowercase match, and common aliases.
 */
export function suggestMappings(
  sourceFields: string[],
  schemaFields: Array<{ name: string; type: string; label?: string }>,
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedTargets = new Set<string>();

  for (const source of sourceFields) {
    const sl = source.toLowerCase().replace(/[_\-\s]/g, "");

    // Skip internal/meta fields
    if (sl.startsWith("_") || sl === "id" || sl === "status" || sl === "createdat" || sl === "updatedat") continue;

    let match: string | null = null;
    let transform: FieldMapping["transform"] = "none";

    for (const schema of schemaFields) {
      if (usedTargets.has(schema.name)) continue;
      const tl = schema.name.toLowerCase().replace(/[_\-\s]/g, "");
      const ll = (schema.label ?? "").toLowerCase().replace(/[_\-\s]/g, "");

      // Exact match
      if (sl === tl || sl === ll) {
        match = schema.name;
        break;
      }

      // Common aliases
      if (ALIASES[sl]?.includes(tl)) {
        match = schema.name;
        if (schema.type === "tags") transform = "split-comma";
        if (schema.type === "date") transform = "date-iso";
        if (schema.type === "number") transform = "number";
        break;
      }
    }

    if (match) {
      usedTargets.add(match);
      mappings.push({ sourceField: source, targetField: match, transform });
    }
  }

  return mappings;
}

const ALIASES: Record<string, string[]> = {
  title: ["title", "name", "headline"],
  name: ["title", "name"],
  headline: ["title"],
  body: ["content", "body", "text"],
  content: ["content", "body"],
  text: ["content", "body"],
  description: ["description", "excerpt", "summary"],
  excerpt: ["excerpt", "description"],
  summary: ["description", "excerpt"],
  date: ["date", "publishedat", "createdat"],
  publishedat: ["date"],
  createdat: ["date"],
  published: ["date"],
  tags: ["tags", "categories"],
  categories: ["tags", "categories"],
  image: ["heroimage", "image", "coverimage", "thumbnail"],
  coverimage: ["heroimage", "image", "coverimage"],
  heroimage: ["heroimage", "image"],
  thumbnail: ["heroimage", "image", "thumbnail"],
  author: ["author"],
  slug: ["slug"],
};

// ── Execute Import ──

/**
 * Execute the import — create documents via CMS content API.
 * Called with the CMS instance and mapped preview rows.
 */
export async function executeImport(
  cms: { content: { create: (collection: string, doc: any) => Promise<unknown> } },
  collection: string,
  rows: ImportPreviewRow[],
): Promise<ImportResult> {
  const validRows = rows.filter((r) => r.valid);
  let imported = 0;
  const errors: ImportResult["errors"] = [];

  for (const row of validRows) {
    try {
      await cms.content.create(collection, {
        slug: row.slug,
        status: "draft",
        data: row.mappedData,
        id: randomUUID(),
        _fieldMeta: {},
      });
      imported++;
    } catch (err) {
      errors.push({
        row: row.rowIndex,
        field: "_create",
        message: err instanceof Error ? err.message : "Create failed",
      });
    }
  }

  return {
    totalRows: rows.length,
    imported,
    skipped: rows.length - validRows.length,
    errors,
  };
}

// ── Helpers ──

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "oe")
    .replace(/[å]/g, "aa")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
