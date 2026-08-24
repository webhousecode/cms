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
 * A `text` field does not mean prose.
 *
 * Schemas store URLs, hex colours, icon names and CSS classes as plain text,
 * and every one of them is in TRANSLATABLE_TYPES. Sent to a translator, "/about"
 * comes back "/om-os" and the link 404s — silently, because a string is a
 * string and the save succeeds.
 *
 * Caught by a test before it shipped: webhouse-site's nav rows are
 * { href, label, color } and all three are type "text".
 *
 * Matched by NAME first, because that is what the schema author actually meant,
 * and by VALUE second for the fields nobody named clearly.
 */
const NON_PROSE_NAME = /^(href|url|link|src|to|path|slug|color|colour|icon|iconName|image|img|variant|className|class|target|rel|id|key|type|anchor|hash)$/i;

const NON_PROSE_VALUE = [
  /^https?:\/\//i,        // absolute URL
  /^\/[^\s]*$/,           // site-root path — "/", "/about", "/blog/x"
  /^#[0-9a-f]{3,8}$/i,     // hex colour
  /^mailto:|^tel:/i,
  // Deliberately NOT "any single word". The first version of this list had
  // /^[a-z0-9]+([-_][a-z0-9]+)*$/i for icon names and css classes, and it
  // swallowed "Services" and "About" — real navigation labels, on the exact
  // site this was written for. A missed icon name is a cosmetic slip; a
  // navigation bar that refuses to translate is the bug this file exists to
  // fix. Only a LOWERCASE hyphenated/underscored token, which prose is not.
  /^[a-z0-9]+([-_][a-z0-9]+)+$/,
];

/** True when this value must be copied across languages, not translated. */
export function isNonProse(fieldName: string, value: string): boolean {
  if (NON_PROSE_NAME.test(fieldName)) return true;
  const v = value.trim();
  // A phrase with a space is prose even if it would otherwise look like a token.
  if (/\s/.test(v)) return false;
  return NON_PROSE_VALUE.some((re) => re.test(v));
}


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
      if (!isNonProse(field.name, val)) out[field.name] = val;
    }
  }

  // ── array fields ────────────────────────────────────────────────────────
  // An `array` field is a repeater of sub-objects, and its text lived entirely
  // outside translation until now: the type is not in TRANSLATABLE_TYPES, so
  // every label inside it was copied to the twin verbatim.
  //
  // MEASURED on webhouse-site 2026-08-24. The Danish globals twin had a Danish
  // site title and a Danish footer tagline, and a navigation bar reading
  // Services · AI · CMS · Work · Articles · Products · About · Contact. The one
  // component on every single page was the one that stayed English, on a site
  // whose whole point was to be bilingual — and nothing failed, because a
  // copied label is a valid label.
  //
  // Sub-fields are matched against the SAME type set, so an href or a colour
  // token inside the same row is left alone. Keys are flattened to
  // `field[index].subfield`, which the model returns as-is and the caller maps
  // straight back — no positional guessing.
  for (const field of fields) {
    if (field.type !== "array") continue;
    const rows = data[field.name];
    if (!Array.isArray(rows)) continue;
    const subFields = (field as { fields?: FieldConfig[] }).fields ?? [];
    const translatableSubs = subFields.filter((f) => TRANSLATABLE_TYPES.has(f.type));
    if (translatableSubs.length === 0) continue;
    rows.forEach((row, i) => {
      if (!row || typeof row !== "object") return;
      for (const sub of translatableSubs) {
        const v = (row as Record<string, unknown>)[sub.name];
        if (typeof v === "string" && v.trim().length > 0 && !isNonProse(sub.name, v)) {
          out[`${field.name}[${i}].${sub.name}`] = v;
        }
      }
    });
  }

  return out;
}

/**
 * Writes translated `field[index].subfield` values back into the document.
 *
 * Deliberately mutates a COPY of the row rather than the source object: the
 * merged data is built from the source document, and writing through would
 * edit the English original while translating it.
 *
 * A key whose row no longer exists is ignored rather than created — the array
 * shape belongs to the source, and a translation must not add rows to it.
 */
export function applyArrayTranslations(
  merged: Record<string, unknown>,
  translated: Record<string, unknown>,
): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(translated)) {
    const m = /^([A-Za-z0-9_]+)\[(\d+)\]\.([A-Za-z0-9_]+)$/.exec(key);
    if (!m || typeof value !== "string") continue;
    const [, fieldName, idxRaw, subName] = m;
    const rows = merged[fieldName];
    if (!Array.isArray(rows)) continue;
    const idx = Number(idxRaw);
    const row = rows[idx];
    if (!row || typeof row !== "object") continue;
    rows[idx] = { ...(row as Record<string, unknown>), [subName]: value };
    applied.push(key);
  }
  return applied;
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
