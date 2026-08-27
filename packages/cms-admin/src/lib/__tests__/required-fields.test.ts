import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  missingRequiredFields,
  requiredFieldErrors,
  checkDocumentRequired,
  type RequiredCheckField,
} from "../required-fields";

/**
 * "Required" in a schema was a promise nobody kept.
 *
 * Measured against production on 27 Aug 2026: a document POSTed with no value
 * for a field its own schema marks `required: true` was accepted with 201. The
 * rule EXISTED — `/api/forms/[name]/route.ts` applied it to form submissions,
 * field by field — and never reached the content write path. Written for the
 * surface that hurt; every other surface reaching the same state went without.
 *
 * `docs/ai-guide/21-framework-consumers.md` lists a field's `required` flag as
 * part of the contract non-TS consumers read out of webhouse-schema.json, so
 * the promise was made outside this repo too.
 */

const F = (name: string, extra: Partial<RequiredCheckField> = {}): RequiredCheckField => ({
  name,
  label: name.toUpperCase(),
  required: true,
  ...extra,
});

describe("what counts as missing", () => {
  it("absent, null and empty string are missing", () => {
    const fields = [F("a"), F("b"), F("c")];
    const got = missingRequiredFields(fields, { b: null, c: "" }).map((f) => f.name);
    expect(got).toEqual(["a", "b", "c"]);
  });

  it("an empty array is missing — a required multi-value field with nothing in it is not filled in", () => {
    expect(missingRequiredFields([F("tags")], { tags: [] })).toHaveLength(1);
    expect(missingRequiredFields([F("tags")], { tags: ["x"] })).toHaveLength(0);
  });

  it("false and 0 are ANSWERS, not blanks", () => {
    // The classic falsy bug, and the expensive direction: `!value` would reject
    // a required checkbox answered "no" and a required number set to zero —
    // silently rejecting exactly one value out of every numeric field's range.
    expect(missingRequiredFields([F("accepted")], { accepted: false })).toHaveLength(0);
    expect(missingRequiredFields([F("count")], { count: 0 })).toHaveLength(0);
  });

  it("an optional field is never missing", () => {
    expect(missingRequiredFields([F("x", { required: false })], {})).toHaveLength(0);
    expect(missingRequiredFields([F("x", { required: undefined })], {})).toHaveLength(0);
  });

  it("a hidden field is never asked of a human", () => {
    expect(missingRequiredFields([F("csrf", { type: "hidden" })], {})).toHaveLength(0);
  });

  it("names the field by the label an editor sees, not the key", () => {
    // "Validation failed" sends someone hunting. The label is the thing they
    // can actually look for on their screen.
    expect(requiredFieldErrors([F("teaches", { label: "Underviser i" })], {}))
      .toEqual(["Underviser i is required"]);
  });
});

describe("when the rule applies", () => {
  const fields = [F("title"), F("body")];

  it("blocks publishing a document with a required field empty", () => {
    const r = checkDocumentRequired(fields, { title: "x" }, "published");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors).toEqual(["BODY is required"]);
  });

  it("lets a complete published document through — not 'always no'", () => {
    // Without this the whole suite would pass on an enforcement that rejected
    // every write, which is a far worse outage than the bug being fixed.
    expect(checkDocumentRequired(fields, { title: "x", body: "y" }, "published").ok).toBe(true);
  });

  it("lets a HALF-FINISHED DRAFT be saved", () => {
    // The decision that keeps this from being a regression: enforcing on every
    // save would stop an editor saving work in progress, which they would hit
    // constantly. Required means required to PUBLISH.
    expect(checkDocumentRequired(fields, {}, "draft").ok).toBe(true);
    expect(checkDocumentRequired(fields, {}, undefined).ok).toBe(true);
    expect(checkDocumentRequired(fields, {}, "archived").ok).toBe(true);
  });

  it("judges the MERGED state, so a partial edit of a valid document passes", () => {
    // A PATCH is partial: an edit touching one field does not resend the rest.
    // Validating the request body would reject every ordinary edit.
    const stored = { title: "x", body: "y" };
    const patch = { title: "x2" };
    expect(checkDocumentRequired(fields, { ...stored, ...patch }, "published").ok).toBe(true);
    // ...and the same patch judged against the REQUEST alone would fail —
    // which is what makes the distinction load-bearing rather than academic.
    expect(checkDocumentRequired(fields, patch, "published").ok).toBe(false);
  });

  it("still catches a patch that EMPTIES a required field", () => {
    const stored = { title: "x", body: "y" };
    expect(checkDocumentRequired(fields, { ...stored, body: "" }, "published").ok).toBe(false);
  });
});

/**
 * One owner of the rule.
 *
 * The whole finding is that the same rule existed twice-over-time: written for
 * forms, absent for content. A second implementation would BE the bug. This is
 * the property a behavioural test cannot see — both copies would pass every
 * case above — so it is checked at the source, with a positive control.
 */
describe("no second copy of the rule", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (p: string) => readFileSync(join(SRC, p), "utf-8");
  const routes = [
    "app/api/forms/[name]/route.ts",
    "app/api/cms/[collection]/route.ts",
    "app/api/cms/[collection]/[slug]/route.ts",
  ];

  it("scanned the files it thinks it scanned", () => {
    for (const r of routes) {
      expect(read(r).length, `${r} empty — guard scanned nothing`).toBeGreaterThan(500);
    }
  });

  it("every write path imports the shared rule", () => {
    for (const r of routes) {
      expect(read(r), `${r} does not use the shared rule`).toContain("required-fields");
    }
  });

  it("nobody re-implements the emptiness test inline", () => {
    // The exact shape of the original inline check. If it reappears anywhere,
    // there are two rules again and they will disagree the day one is fixed.
    for (const r of routes) {
      const code = read(r).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(code, `${r} re-implements the required check inline`)
        .not.toMatch(/\.required\s*&&\s*\(/);
    }
  });
});
