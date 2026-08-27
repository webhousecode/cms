/**
 * A select field's legal values — one source, read by everything that needs it.
 *
 * Measured on 27 Aug 2026 while sizing the chat's system prompt. The prompt
 * describes every field on a site, and for a select field it said only THAT it
 * was a select:
 *
 *     - `kind` (select) *required — Fulfillment-type
 *
 * The legal values (digital | physical | gift) appeared nowhere. Asked with
 * that prompt and no tools, the model answered "digital, physical, giftcard" —
 * inventing the third — and, told to create a document, produced
 * `"kind": "digital download"`. Both confidently, with no hedging.
 *
 * The control question in the same run is what makes this the prompt's fault
 * and not the model's: asked about a COLLECTION that does not exist, it
 * declined and listed the 19 real ones. Collections are in the prompt. Option
 * values were not. It invents precisely where we left a gap — and the prompt's
 * own Rule 14 demands "exact option values for select fields" while omitting
 * the one thing needed to obey it.
 *
 * `agent-runner.ts` already got this right for the AI AGENTS and the chat never
 * received it — the same repo, the same problem, one surface solved. So the
 * phrasing lives here and is IMPORTED by both. A copy is always the old
 * version of the rule.
 *
 * Scope: a collection's own fields. Select fields nested inside `array`,
 * `object` or `blocks` are NOT covered — the chat prompt does not render those
 * either, so this matches the surface the model is told to write. Stated here
 * rather than left to be discovered: sanneandersen has 3 top-level select
 * fields and 4 more inside block definitions.
 */

export interface SelectOption { label: string; value: string }

export interface SelectCheckField {
  name: string;
  type?: string;
  label?: string;
  options?: SelectOption[];
}

/**
 * The legal values, or null when this field does not constrain them.
 *
 * null (not []) for a non-select field, and for a select field that declares no
 * options — an empty option list is a schema the site validator already warns
 * about, and treating it as "nothing is legal" would reject every value on a
 * field whose author simply had not filled it in yet.
 */
export function selectOptionValues(field: SelectCheckField): string[] | null {
  if (field.type !== "select") return null;
  const opts = field.options;
  if (!Array.isArray(opts) || opts.length === 0) return null;
  return opts.map((o) => o.value);
}

/**
 * How a select field's constraint is worded to a model — the ONE phrasing.
 *
 * Returns null when there is nothing to say, so callers render their normal
 * output instead of an empty "MUST be one of" with nothing after it.
 */
export function describeSelectOptions(field: SelectCheckField): string | null {
  const values = selectOptionValues(field);
  if (!values) return null;
  return `MUST be one of ${values.map((v) => `"${v}"`).join(" | ")}`;
}

/**
 * One sentence per illegal value, naming the field AND what was allowed.
 *
 * Judges exactly the data it is handed and nothing else — WHICH data that is
 * (the write, not the merged document) is the caller's decision, made once in
 * `checkDocumentSchema`. An absent field is silently fine, which is what makes
 * passing only the written fields meaningful.
 */
export function invalidSelectValues(
  fields: SelectCheckField[],
  data: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const f of fields) {
    const values = selectOptionValues(f);
    if (!values) continue;
    const v = data[f.name];
    // Empty means "not answered". Whether that is allowed is `required`'s
    // question, and it already has an owner; answering it here too would give
    // one mistake two different error messages.
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || !values.includes(v)) {
      errors.push(
        `${f.label || f.name}: "${String(v)}" is not a valid value — must be one of ${values.join(", ")}`,
      );
    }
  }
  return errors;
}
