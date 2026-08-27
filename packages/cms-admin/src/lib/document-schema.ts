/**
 * Does this document satisfy its own schema? One owner of that question.
 *
 * The rule already existed in `/api/forms/[name]/route.ts`, applied to form
 * submissions, and never reached the CONTENT write path. Measured on 27 Aug
 * 2026 against production: a document POSTed with no value for a field its own
 * schema marks `required: true` was accepted with 201. The schema said one
 * thing and the API did another, on every site.
 *
 * That gap is not an oversight so much as a shape: a check gets written for the
 * surface that hurt, and the other surfaces that reach the same state never get
 * it. This file exists so there is one place to change and no second copy to
 * drift — a second implementation would BE the bug it fixes.
 *
 * `docs/ai-guide/21-framework-consumers.md` lists a field's `required` flag as
 * part of the exported contract non-TS consumers read out of
 * `webhouse-schema.json`, so this is a promise made outside the repo too.
 *
 * F177 added the second half of the same question — a select field's value has
 * to be one the field actually declares. Same shape of gap, found the same way:
 * the chat could write `kind: "giftcard"` on a field whose options are
 * digital|physical|gift, and nothing anywhere refused it. `validate.ts` in the
 * engine validates the CONFIG, not the DATA. Both halves live here so a route
 * asks one question instead of remembering two.
 */

import { invalidSelectValues, type SelectCheckField } from "@/lib/select-options";

export interface RequiredCheckField {
  name: string;
  label?: string;
  required?: boolean;
  type?: string;
}

/**
 * Which required fields are missing from this data — empty when it is complete.
 *
 * Absent, null and empty-string all count as missing; so does an empty array,
 * because a required multi-value field with nothing in it is not filled in.
 * `false` and `0` are NOT missing — a required checkbox answered "no" and a
 * required number set to zero are both real answers, and treating them as
 * blank is the classic falsy bug (it would silently reject exactly one value
 * out of every numeric field's range).
 */
export function missingRequiredFields(
  fields: RequiredCheckField[],
  data: Record<string, unknown>,
): RequiredCheckField[] {
  return fields.filter((f) => {
    if (!f.required) return false;
    if (f.type === "hidden") return false; // never filled in by a human
    const v = data[f.name];
    if (v === undefined || v === null || v === "") return true;
    return Array.isArray(v) && v.length === 0;
  });
}

/** One sentence per missing field, by the label an editor actually sees. */
export function requiredFieldErrors(
  fields: RequiredCheckField[],
  data: Record<string, unknown>,
): string[] {
  return missingRequiredFields(fields, data).map(
    (f) => `${f.label || f.name} is required`,
  );
}

/**
 * May this document be written?
 *
 * Two decisions live here rather than at the call sites, so every write path
 * answers them the same way:
 *
 * 1. ONLY PUBLISHED DOCUMENTS. Enforcing on every save would stop an editor
 *    saving a half-finished draft — a worse failure than the one being fixed,
 *    and one they would hit constantly. "Required" means required to PUBLISH.
 *
 * 2. THE MERGED STATE, not the request. A PATCH is partial: an edit that
 *    touches one field does not resend the rest. Validating the request body
 *    would reject every partial edit of a perfectly valid document. Callers
 *    must pass the document as it will be AFTER the write.
 */
export function checkDocumentRequired(
  fields: RequiredCheckField[],
  mergedData: Record<string, unknown>,
  status: string | undefined,
): { ok: true } | { ok: false; errors: string[] } {
  if (status !== "published") return { ok: true };
  const errors = requiredFieldErrors(fields, mergedData);
  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Everything the schema promises about this write, checked at once.
 *
 * The two halves deliberately scope differently, and the difference is the
 * point rather than an inconsistency:
 *
 * - `required` asks about the WHOLE document ("is it complete?"), so it runs on
 *   the merged state and only when publishing.
 * - a select value is a property of ONE field ("is this value legal?"), so it
 *   runs on what the write actually carries, draft or published. A bad value
 *   someone stored earlier must not block an unrelated edit today — that would
 *   punish the wrong write — and there is no such thing as a legitimately
 *   half-finished select value, so there is no reason to wait for publish.
 *
 * `writtenData` is the request's own `data`; `mergedData` is the document as it
 * will be after the write. On a create they are the same object.
 */
export function checkDocumentSchema(
  fields: (RequiredCheckField & SelectCheckField)[],
  mergedData: Record<string, unknown>,
  writtenData: Record<string, unknown>,
  status: string | undefined,
): { ok: true } | { ok: false; errors: string[] } {
  const errors = [
    ...invalidSelectValues(fields, writtenData),
    ...(status === "published" ? requiredFieldErrors(fields, mergedData) : []),
  ];
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** What both halves need to know about a field. */
export type SchemaCheckField = RequiredCheckField & SelectCheckField;
