/**
 * Deterministic schema-field inference + surgical config insertion.
 *
 * Replaces the previous AI-driven `add-to-schema` implementation that asked an
 * LLM to rewrite the WHOLE cms.config.ts and wrote the raw model output to disk
 * unvalidated — which destroyed webhouse-site's config on 2026-06-07 (the model
 * returned a markdown explanation instead of code, and the config was truncated
 * to 8KB before being sent so it could never be reproduced anyway).
 *
 * Inferring a field type from a sample value ("this is a string" → text, "this
 * is a number" → number) is purely rule-based — no AI needed. And instead of
 * rewriting the file, we INSERT the new field lines surgically into the target
 * collection's `fields: [ … ]` array, leaving every other byte (urlPattern,
 * nested array `fields`, `forms`, blocks, autolinks, storage, locales) untouched.
 */

export interface InferredField {
  /** present only for nested fields (array-of-object / object subfields) */
  name?: string;
  type: string;
  fields?: InferredField[];
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i;

/** Infer a field type from one field's collected sample values. Pure + deterministic. */
export function inferFieldType(samples: unknown[], depth = 0): InferredField {
  const vals = samples.filter((v) => v !== undefined && v !== null);
  if (vals.length === 0) return { type: "text" }; // no signal — safe default

  const first = vals[0];
  if (typeof first === "boolean") return { type: "boolean" };
  if (typeof first === "number") return { type: "number" };
  if (typeof first === "string") return { type: inferStringType(vals as string[]) };

  if (Array.isArray(first)) {
    const all = (vals as unknown[][]).flat();
    if (all.length === 0) return { type: "tags" };
    if (all.every((x) => typeof x === "string")) return { type: "tags" };
    if (depth < 3 && all.every((x) => x !== null && typeof x === "object" && !Array.isArray(x))) {
      return { type: "array", fields: inferObjectFields(all as Record<string, unknown>[], depth + 1) };
    }
    return { type: "tags" };
  }

  if (typeof first === "object") {
    if (depth >= 3) return { type: "object" };
    return { type: "object", fields: inferObjectFields(vals as Record<string, unknown>[], depth + 1) };
  }

  return { type: "text" };
}

function inferStringType(strings: string[]): string {
  const s = strings.find((x) => x.length > 0) ?? "";
  if (!s) return "text";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "date";
  if (IMAGE_EXT.test(s) || /^\/uploads\//.test(s)) return "image";
  if (/<[a-z][\s\S]*>/i.test(s)) return "richtext";
  if (strings.some((x) => x.includes("\n")) || s.length > 120) return "textarea";
  return "text";
}

function inferObjectFields(objs: Record<string, unknown>[], depth: number): InferredField[] {
  const keys = [...new Set(objs.flatMap((o) => Object.keys(o ?? {})))];
  return keys.map((k) => {
    const inf = inferFieldType(objs.map((o) => o?.[k]), depth);
    return { name: k, ...inf };
  });
}

/** "titleHighlight" → "Title highlight", "sortOrder" → "Sort order" */
export function humanizeLabel(name: string): string {
  const joined = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function fieldProps(name: string, inf: InferredField): string {
  const parts = [
    `name: ${JSON.stringify(name)}`,
    `type: ${JSON.stringify(inf.type)}`,
    `label: ${JSON.stringify(humanizeLabel(name))}`,
  ];
  if (inf.fields?.length) {
    const nested = inf.fields.map((sf) => `{ ${fieldProps(sf.name ?? "field", sf)} }`).join(", ");
    parts.push(`fields: [${nested}]`);
  }
  return parts.join(", ");
}

/** A single `{ name: …, type: …, label: … },` line (no leading indent). */
export function serializeFieldLine(name: string, inf: InferredField): string {
  return `{ ${fieldProps(name, inf)} },`;
}

/**
 * Walk from `s[openIdx] === '['` to its matching `]`, ignoring brackets that
 * appear inside string literals (config labels like "Stats [home]" contain
 * literal brackets — naive counting would mis-match). Returns the index of the
 * closing bracket, or -1 if unbalanced.
 */
export function findMatchingBracket(s: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  let quote = "";
  for (let j = openIdx; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (c === "\\") { j++; continue; }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = true; quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return j; }
  }
  return -1;
}

/** Locate a collection's `fields: [ … ]` array bounds in raw config source. */
export function locateCollectionFieldsArray(
  source: string,
  collection: string,
): { openIdx: number; closeIdx: number } | null {
  const reColl = /defineCollection\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = reColl.exec(source))) {
    const blockStart = m.index + m[0].length;
    const window = source.slice(blockStart, blockStart + 600);
    const nameMatch = /name:\s*["']([^"']+)["']/.exec(window);
    if (!nameMatch || nameMatch[1] !== collection) continue;

    const fieldsKey = /fields:\s*\[/.exec(source.slice(blockStart));
    if (!fieldsKey) return null;
    const openIdx = blockStart + fieldsKey.index + fieldsKey[0].length - 1; // index of '['
    const closeIdx = findMatchingBracket(source, openIdx);
    if (closeIdx < 0) return null;
    return { openIdx, closeIdx };
  }
  return null;
}

/**
 * Insert already-serialized field lines into a collection's fields array,
 * preserving every other byte of the source. Throws if the collection's
 * fields array can't be located (caller must NOT write on throw).
 */
export function insertFieldsIntoCollection(
  source: string,
  collection: string,
  fieldLines: string[],
): string {
  if (fieldLines.length === 0) return source;
  const loc = locateCollectionFieldsArray(source, collection);
  if (!loc) {
    throw new Error(`Could not locate fields array for collection "${collection}" in cms.config.ts`);
  }
  const { openIdx, closeIdx } = loc;
  const inner = source.slice(openIdx + 1, closeIdx);
  const trimmed = inner.replace(/\s+$/, "");
  const isEmpty = trimmed.trim() === "";
  const needsComma = !isEmpty && !trimmed.endsWith(",");
  const newLines = fieldLines.map((l) => "        " + l).join("\n");

  const newInner = isEmpty
    ? `\n${newLines}\n      `
    : `${trimmed}${needsComma ? "," : ""}\n${newLines}\n      `;

  return source.slice(0, openIdx + 1) + newInner + source.slice(closeIdx);
}

/**
 * Structural safety check before writing. Guarantees we never persist a config
 * that lost `defineConfig`, dropped a collection, didn't actually add the new
 * fields, or somehow shrank. This is the guardrail the AI version lacked.
 */
export function assertConfigStructureIntact(
  before: string,
  after: string,
  expectedCollections: string[],
  newFieldNames: string[],
): void {
  if (!after.includes("defineConfig")) {
    throw new Error("Refusing to write: result no longer contains defineConfig");
  }
  if (after.length <= before.length) {
    throw new Error("Refusing to write: result did not grow after inserting fields");
  }
  for (const c of expectedCollections) {
    const re = new RegExp(`name:\\s*["']${escapeRegExp(c)}["']`);
    if (!re.test(after)) {
      throw new Error(`Refusing to write: collection "${c}" disappeared from config`);
    }
  }
  for (const f of newFieldNames) {
    if (!after.includes(`name: ${JSON.stringify(f)}`)) {
      throw new Error(`Refusing to write: new field "${f}" missing from result`);
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
