/**
 * F162.1 — pure coverage core (no I/O, no browser).
 *
 * Turns a site's `webhouse-schema.json` (the `toJsonSchema` output) into the
 * shape `@broberg/lens-engine` expects — keeping ONLY the text-editable fields,
 * since those are the ones that should carry `data-cms-field` and be editable
 * inline. Non-text fields (dates, tags, images, numbers, refs) are not text and
 * are never expected to be inline-editable, so they must not count as gaps.
 *
 * These types MIRROR `@broberg/lens-engine`'s CoverageSchema / CoverageReport so
 * this module builds + unit-tests without pulling the engine's heavy (playwright)
 * dependency. The command glue (coverage.ts) passes the real engine values
 * through these identical shapes.
 */

export interface CoverageSchema {
  [collection: string]: { fields: string[] };
}

export interface CoveragePage {
  collection: string;
  slug: string;
  present: string[];
  expected: string[];
  missing: string[];
  orphans: string[];
  coveragePct: number;
}

export interface CoverageReport {
  pages: CoveragePage[];
}

/** Field types that render editable prose → expected to carry data-cms-field.
 *  Deliberately a whitelist: an unknown/annotation-less field is NOT demanded,
 *  so the gate never nags about a non-text field it doesn't understand. */
const TEXT_FIELD_TYPES = new Set(['text', 'textarea', 'richtext', 'markdown']);

type JsonLike = Record<string, unknown>;

function asObject(v: unknown): JsonLike | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonLike) : null;
}

/** A collection's editable fields live at `properties.data.properties`, either
 *  directly on the collection schema or inside one of its `allOf` entries. */
function findDataProperties(collection: JsonLike): JsonLike | null {
  const direct = asObject(asObject(asObject(collection.properties)?.data)?.properties);
  if (direct) return direct;
  const allOf = Array.isArray(collection.allOf) ? collection.allOf : [];
  for (const entry of allOf) {
    const nested = asObject(asObject(asObject(asObject(entry)?.properties)?.data)?.properties);
    if (nested) return nested;
  }
  return null;
}

/** True when the input is already a parsed CoverageSchema ({col:{fields:[]}}). */
function isCoverageSchema(input: JsonLike): boolean {
  const values = Object.values(input);
  return (
    values.length > 0 &&
    values.every((v) => {
      const o = asObject(v);
      return !!o && Array.isArray(o.fields);
    })
  );
}

/**
 * Normalise a `webhouse-schema.json` (toJsonSchema output, keyed under
 * `.collections`) OR an already-parsed CoverageSchema into the engine's
 * CoverageSchema, keeping only text-editable fields.
 */
export function parseCoverageSchema(input: unknown): CoverageSchema {
  const root = asObject(input);
  if (!root) return {};

  // Shape from webhouse.app's `GET /api/schema?site=<id>`:
  //   { collections: [ { name, label, fields: [ { name, type } ] } ] }
  // (the live CmsConfig collections, the schema source for bespoke sites that
  //  have no local webhouse-schema.json). Keep only text-editable field names.
  if (Array.isArray(root.collections)) {
    const out: CoverageSchema = {};
    for (const raw of root.collections) {
      const col = asObject(raw);
      if (!col || typeof col.name !== 'string') continue;
      const defs = Array.isArray(col.fields) ? col.fields : [];
      const fields = defs
        .map(asObject)
        .filter(
          (f): f is JsonLike =>
            !!f && typeof f.name === 'string' && typeof f.type === 'string' && TEXT_FIELD_TYPES.has(f.type),
        )
        .map((f) => f.name as string);
      out[col.name] = { fields };
    }
    return out;
  }

  // Already a plain CoverageSchema? pass it through untouched.
  if (root.collections === undefined && isCoverageSchema(root)) {
    return root as unknown as CoverageSchema;
  }

  const collections = asObject(root.collections) ?? {};
  const out: CoverageSchema = {};
  for (const [name, raw] of Object.entries(collections)) {
    const collection = asObject(raw);
    if (!collection) continue;
    const props = findDataProperties(collection);
    if (!props) continue;
    const fields = Object.entries(props)
      .filter(([, def]) => {
        const ft = asObject(def)?.['x-webhouse-field-type'];
        return typeof ft === 'string' && TEXT_FIELD_TYPES.has(ft);
      })
      .map(([field]) => field);
    out[name] = { fields };
  }
  return out;
}

export interface CoverageSummary {
  /** True when NO page has a missing field (after the engine's allowlist). */
  pass: boolean;
  totalExpected: number;
  totalMissing: number;
  /** covered / expected across all pages, 0–100 (100 when nothing is expected). */
  coveragePct: number;
  gaps: { collection: string; slug: string; missing: string[] }[];
}

/**
 * Aggregate a lens-engine CoverageReport into a single pass/fail verdict.
 * F162.1 is strict: any missing field fails. The "no NEW gaps" baseline-delta
 * model is layered on top in F162.4, not here.
 */
export function summarizeCoverage(report: CoverageReport): CoverageSummary {
  let totalExpected = 0;
  let totalCovered = 0;
  const gaps: CoverageSummary['gaps'] = [];
  for (const page of report.pages) {
    totalExpected += page.expected.length;
    totalCovered += page.expected.length - page.missing.length;
    if (page.missing.length > 0) {
      gaps.push({ collection: page.collection, slug: page.slug, missing: page.missing });
    }
  }
  const totalMissing = gaps.reduce((n, g) => n + g.missing.length, 0);
  const coveragePct = totalExpected === 0 ? 100 : Math.round((totalCovered / totalExpected) * 100);
  return { pass: gaps.length === 0, totalExpected, totalMissing, coveragePct, gaps };
}
