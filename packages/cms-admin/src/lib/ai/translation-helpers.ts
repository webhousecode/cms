import type { FieldConfig, CollectionConfig } from "@webhouse/cms";

/**
 * Field types whose values should be translated when copying a document
 * across locales. Text-like types are translated as strings; "tags" is
 * translated as an array of strings (each tag is a short keyword).
 */
export const TRANSLATABLE_TYPES = new Set<string>([
  "text",
  "richtext",
  "textarea",
  "slug",
  "htmldoc",
  "interactive",
  "tags",
]);

export type TranslatableValue = string | string[];

/**
 * Pulls every translatable value out of a document's data, ready to send
 * to the LLM. Tags become string[] (filtered to non-empty strings); other
 * translatable types become trimmed strings. Empty fields are skipped.
 */
export function collectTranslatableFields(
  data: Record<string, unknown>,
  fields: FieldConfig[],
): Record<string, TranslatableValue> {
  const out: Record<string, TranslatableValue> = {};
  const translatable = fields.filter((f) => TRANSLATABLE_TYPES.has(f.type));
  for (const field of translatable) {
    const val = data[field.name];
    if (field.type === "tags") {
      if (Array.isArray(val)) {
        const cleaned = val.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0,
        );
        if (cleaned.length > 0) out[field.name] = cleaned;
      }
    } else if (typeof val === "string" && val.trim().length > 0) {
      out[field.name] = val;
    }
  }
  return out;
}

/**
 * Reading-time field detection. Matches common naming conventions across
 * locales (English + Danish), so a single config change covers all sites:
 * readTime, readTimeMin, readingTime, minutesToRead, læsetid, etc.
 *
 * Pattern is intentionally broad — false positives are harmless because
 * the consumer also checks field.type === "number".
 */
const READ_TIME_PATTERN = /^(read.?time|reading.?time|read.?minutes?|minutes?.?to.?read|læse.?tid)/i;

export function findReadTimeField(
  collection: CollectionConfig,
): FieldConfig | undefined {
  return collection.fields.find(
    (f) => f.type === "number" && READ_TIME_PATTERN.test(f.name),
  );
}

/**
 * Picks the document's primary body field for word-count purposes.
 * Prefers richtext > htmldoc > textarea. Returns undefined if no body-like
 * field exists.
 */
export function findPrimaryBodyField(
  collection: CollectionConfig,
): FieldConfig | undefined {
  return (
    collection.fields.find((f) => f.type === "richtext") ??
    collection.fields.find((f) => f.type === "htmldoc") ??
    collection.fields.find((f) => f.type === "textarea")
  );
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes reading time in whole minutes from richtext/HTML/plaintext.
 * Returns at least 1 minute when any words are present; 0 for empty input.
 */
export function computeReadingMinutes(content: string, wpm = 220): number {
  if (!content) return 0;
  const text = stripHtml(content);
  if (!text) return 0;
  const words = text.split(/\s+/).filter((w) => w.length > 0).length;
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / wpm));
}
