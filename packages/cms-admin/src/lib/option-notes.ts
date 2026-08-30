/**
 * F180 — a select option may show a value that lives in the site's own content,
 * instead of repeating it inside its label.
 *
 * The problem this exists for: sanneandersen's `product-types.kind` carried the
 * platform fee in the label text — "Leveret online (30%)" — while the real
 * number lived in the consumer's own fee calculation. Two copies of one number,
 * and the label is the one nobody remembers to update. The rate changed, the
 * menu kept saying 30%, and nothing anywhere said otherwise.
 *
 * So an option may carry a `note` holding `{{collection.path}}` placeholders,
 * resolved against a collection with `kind: "global"` on that site. Those hold
 * exactly one document, so there is no slug to guess and no query syntax to
 * invent. The label names the category; the note carries the number.
 *
 *   { value: "digital", label: "Leveret online — webinar, ebog, lydfil",
 *     note: "{{global.fees.digital}}%" }
 *
 * This is a SUBSTITUTION, deliberately not a template engine: no conditions, no
 * loops, no filters, no expressions. `{{path}}` → value, and nothing else. The
 * moment it grows an expression syntax it stops being a reference and becomes a
 * second place to put logic.
 */

/** One `{{collection.path}}` occurrence found in a note. */
export interface NoteRef {
  /** The placeholder as written, including braces — used for replacement. */
  raw: string;
  /** First segment: the global collection to read from. */
  collection: string;
  /** Remaining dot-path into that document's data. */
  path: string;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_.-]+?)\s*\}\}/g;

/** Every placeholder in `note`, in order. Empty for a note with none. */
export function parseNoteRefs(note: string | undefined): NoteRef[] {
  if (!note) return [];
  const out: NoteRef[] = [];
  for (const m of note.matchAll(PLACEHOLDER)) {
    out.push({ raw: m[0], collection: m[1], path: m[2] });
  }
  return out;
}

/** The distinct collections a set of notes reads from — what to fetch. */
export function noteCollections(notes: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const n of notes) for (const r of parseNoteRefs(n)) seen.add(r.collection);
  return [...seen];
}

/** Walk a dot-path into a document's data. Returns undefined at any gap. */
export function readPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Fill in a note's placeholders, or return undefined.
 *
 * All-or-nothing on purpose, and this is a correction to F180's own plan-doc,
 * which first said the placeholder should vanish and the rest of the note stay.
 * Thinking it through: "{{global.fees.digital}}%" would then render as a bare
 * "%" — worse than showing nothing, because it looks like a value of zero or a
 * broken field rather than an absent one. A note is either complete or absent.
 *
 * A note is never load-bearing: the option still renders with its label, and
 * the editor can still pick it. A missing rate must never block choosing a
 * category — the number is decoration on the choice, not a precondition for it.
 */
export function resolveNote(
  note: string | undefined,
  lookup: (collection: string, path: string) => unknown,
): string | undefined {
  const refs = parseNoteRefs(note);
  if (!note || refs.length === 0) return undefined;
  let out = note;
  for (const ref of refs) {
    const v = lookup(ref.collection, ref.path);
    if (v === undefined || v === null || v === "") return undefined;
    out = out.replace(ref.raw, String(v));
  }
  return out;
}
