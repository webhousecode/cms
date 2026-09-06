/**
 * F157.14 — the guards that decide whether an inline edit propagates to a
 * sibling locale, and the merge that protects the sibling's other fields.
 *
 * Every test here exists because there is a way this feature could quietly do
 * DAMAGE rather than quietly do nothing. The assertions are strict equality on
 * the values read back, never "contains" — a merge that appends instead of
 * replacing passes a contains-check while corrupting the document.
 */
import { describe, it, expect } from "vitest";
import type { CollectionConfig } from "@webhouse/cms";
import {
  planChangedFieldTranslation,
  mergeTranslatedFields,
  buildChangedFieldPrompt,
  type LocaleDoc,
} from "../ai/translate-changed-fields";

const collection = {
  name: "posts",
  fields: [
    { name: "title", type: "text" },
    { name: "content", type: "richtext" },
    { name: "tags", type: "tags" },
    { name: "publishedAt", type: "date" },
    { name: "readTime", type: "number" },
    { name: "canonicalUrl", type: "text" },
    // A select whose stored value is an ordinary English PHRASE. This exists to
    // test the field-TYPE filter on its own: a date is also caught by the
    // non-prose check and a number by the string check, so neither proves the
    // type filter — mutation-tested, and with the filter removed both of those
    // tests stayed green. This one does not: "Wide columns" contains a space,
    // so isNonProse calls it prose, and nothing but the type filter stops it
    // being translated into "Brede kolonner" and breaking the layout.
    { name: "layout", type: "select" },
  ],
} as unknown as CollectionConfig;

const da: LocaleDoc = {
  id: "doc-da",
  slug: "min-artikel",
  locale: "da",
  translationGroup: "grp-1",
  data: { title: "Gammel titel", content: "Gammel brødtekst", tags: ["metode"], readTime: 3 },
};
const en: LocaleDoc = {
  id: "doc-en",
  slug: "my-article",
  locale: "en",
  translationGroup: "grp-1",
  data: { title: "Old title", content: "Old body", tags: ["method"], readTime: 3 },
};

const base = {
  source: da,
  collection,
  siblings: [da, en],
  targetLocale: "en",
  defaultLocale: "da",
  autoRetranslateOnUpdate: true,
};

describe("planChangedFieldTranslation — what gets translated", () => {
  it("picks up ONLY the field that changed", () => {
    const plan = planChangedFieldTranslation({ ...base, changed: { title: "Ny titel" } });
    expect(plan.translate).toBe(true);
    if (!plan.translate) return;
    // Strict: the plan must carry the title and NOTHING else. A plan that also
    // carried `content` would re-translate a field nobody edited, which is the
    // whole-document behaviour this module exists to avoid.
    expect(Object.keys(plan.fields)).toEqual(["title"]);
    expect(plan.fields.title).toBe("Ny titel");
  });

  it("finds the sibling by translationGroup, not by a slug guess", () => {
    // The English twin's slug is unrelated to the Danish one. A `${slug}-en`
    // guess would find nothing here — and worse, on a slug that survives
    // translation it finds the SOURCE (measured on webhouse-site 2026-08-24,
    // where translating globals/site overwrote the English document in place).
    const plan = planChangedFieldTranslation({ ...base, changed: { title: "Ny titel" } });
    expect(plan.translate).toBe(true);
    if (!plan.translate) return;
    expect(plan.target.id).toBe("doc-en");
    expect(plan.target.slug).toBe("my-article");
  });

  it("translates several changed fields in one pass", () => {
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { title: "Ny titel", content: "Ny brødtekst" },
    });
    expect(plan.translate).toBe(true);
    if (!plan.translate) return;
    expect(Object.keys(plan.fields).sort()).toEqual(["content", "title"]);
  });

  it("carries a changed tags array", () => {
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { tags: ["metode", "kvalitet"] },
    });
    expect(plan.translate).toBe(true);
    if (!plan.translate) return;
    expect(plan.fields.tags).toEqual(["metode", "kvalitet"]);
  });
});

describe("planChangedFieldTranslation — the guards", () => {
  it("does nothing when the owner has not turned it on", () => {
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { title: "Ny titel" },
      autoRetranslateOnUpdate: false,
    });
    expect(plan.translate).toBe(false);
  });

  it("NEVER writes upstream from a translated page", () => {
    // The circular guard. Without it an edit on the English page rewrites the
    // Danish one, and the two take turns overwriting each other — both looking
    // "saved" the whole time.
    const plan = planChangedFieldTranslation({
      ...base,
      source: en,
      changed: { title: "New title" },
      targetLocale: "da",
    });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.reason).toContain("not the default");
  });

  it("does nothing — and does not fail — when there is no sibling", () => {
    const plan = planChangedFieldTranslation({
      ...base,
      siblings: [da],
      changed: { title: "Ny titel" },
    });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.reason).toContain("no en sibling");
  });

  it("does nothing when the source has no translationGroup", () => {
    const orphan = { ...da, translationGroup: undefined };
    const plan = planChangedFieldTranslation({
      ...base,
      source: orphan,
      siblings: [orphan, en],
      changed: { title: "Ny titel" },
    });
    expect(plan.translate).toBe(false);
  });

  it("a changed date or number costs no LLM call", () => {
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { publishedAt: "2026-09-06", readTime: 7 },
    });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.reason).toContain("no translatable field changed");
  });

  it("a re-sent identical value is not an edit", () => {
    // Inline editors save on blur, so a click-in/click-out with no typing
    // re-sends the stored value. That must not spend a translation.
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { title: "Gammel titel" },
    });
    expect(plan.translate).toBe(false);
  });

  it("a non-translatable TYPE is skipped even when its value reads as prose", () => {
    // The one test that isolates the type filter. "Wide columns" is a phrase, so
    // the non-prose check passes it, and it is a string, so the type check
    // passes it. Only the field-type filter refuses it — and translating a
    // select value into "Brede kolonner" would break the rendering.
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { layout: "Wide columns" },
    });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.reason).toContain("no translatable field changed");
  });

  it("skips a non-prose value even in a text field", () => {
    const plan = planChangedFieldTranslation({
      ...base,
      changed: { canonicalUrl: "https://broberg.ai/en/blog/x" },
    });
    expect(plan.translate).toBe(false);
  });
});

describe("a schema with NO declared fields — measured on broberg.ai", () => {
  // All nine collections on that site declare zero fields, so a type lookup
  // answers "unknown" for everything, `title` included. Skipping the unknown
  // meant the feature could never fire there at all.
  const tomt = { name: "posts", fields: [] } as unknown as CollectionConfig;
  const uden = { ...base, collection: tomt };

  it("translates a prose field the schema does not know", () => {
    const plan = planChangedFieldTranslation({ ...uden, changed: { title: "Ny titel" } });
    expect(plan.translate).toBe(true);
    if (!plan.translate) return;
    expect(plan.fields.title).toBe("Ny titel");
  });

  it("still refuses a URL, a path and a slug-like token", () => {
    for (const v of ["https://broberg.ai/x", "/da/blog/x", "ai-metode"]) {
      const plan = planChangedFieldTranslation({ ...uden, changed: { someField: v } });
      expect(plan.translate).toBe(false);
    }
  });

  it.each(["author", "locale", "status", "publishedAt", "category", "email"])(
    "still refuses the metadata field %s even when its value reads as prose",
    (navn) => {
      const plan = planChangedFieldTranslation({ ...uden, changed: { [navn]: "Christian Broberg" } });
      expect(plan.translate).toBe(false);
    },
  );

  it("a DECLARED type still wins over the value guess", () => {
    // `layout` is a select carrying an ordinary phrase. With the schema present
    // it must stay refused — the fallback is for absence, not for override.
    const plan = planChangedFieldTranslation({ ...base, changed: { layout: "Wide columns" } });
    expect(plan.translate).toBe(false);
  });

  it("a non-string value is never guessed at", () => {
    const plan = planChangedFieldTranslation({ ...uden, changed: { readTime: 7, featured: true } });
    expect(plan.translate).toBe(false);
  });

  it("an unchanged value is still not an edit", () => {
    const plan = planChangedFieldTranslation({ ...uden, changed: { title: "Gammel titel" } });
    expect(plan.translate).toBe(false);
  });
});

describe("missingSibling — only ONE refusal may trigger a full re-translation", () => {
  // This suite exists because of a real production defect. The route matched
  // `reason.startsWith("no ")` to decide whether to fall back to the
  // whole-document route, and THREE reasons begin that way. So a changed date —
  // refused on purpose — re-translated the entire document and overwrote the
  // sibling: exactly the damage this module was built to prevent. The end-to-end
  // check found it; no test did. These make the distinction structural.

  it("a genuinely missing sibling flags for fallback", () => {
    const plan = planChangedFieldTranslation({ ...base, siblings: [da], changed: { title: "Ny titel" } });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.missingSibling).toBe(true);
  });

  it.each([
    ["the switch is off", { autoRetranslateOnUpdate: false }, { title: "Ny titel" }],
    ["nothing translatable changed", {}, { publishedAt: "2026-09-06" }],
    ["a non-translatable type", {}, { layout: "Wide columns" }],
    ["an unchanged value", {}, { title: "Gammel titel" }],
    ["a non-prose value", {}, { canonicalUrl: "https://broberg.ai/x" }],
  ])("a deliberate refusal (%s) must NOT flag for fallback", (_label, extra, changed) => {
    const plan = planChangedFieldTranslation({ ...base, ...extra, changed });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.missingSibling).toBe(false);
  });

  it("an edit on a translated page must NOT flag for fallback", () => {
    // The worst one: this would create a Danish document from the English page.
    const plan = planChangedFieldTranslation({
      ...base,
      source: en,
      changed: { title: "New title" },
      targetLocale: "da",
    });
    expect(plan.translate).toBe(false);
    if (plan.translate) return;
    expect(plan.missingSibling).toBe(false);
  });
});

describe("mergeTranslatedFields — the sibling's other fields survive", () => {
  it("writes the translated field and leaves every other one byte-for-byte", () => {
    const merged = mergeTranslatedFields(
      en.data!,
      { title: "New title from AI" },
      ["title"],
    );
    expect(merged.title).toBe("New title from AI");
    // THE load-bearing assertion of this card. `content` here is a
    // hand-polished English sentence; the whole-document route would replace it
    // with a fresh machine translation of the Danish on every comma fix.
    expect(merged.content).toBe("Old body");
    expect(merged.tags).toEqual(["method"]);
    expect(merged.readTime).toBe(3);
  });

  it("does not mutate the sibling object it was given", () => {
    const before = JSON.stringify(en.data);
    mergeTranslatedFields(en.data!, { title: "New title" }, ["title"]);
    expect(JSON.stringify(en.data)).toBe(before);
  });

  it("keeps the sibling's value when the model declined a field", () => {
    // An empty string back from the model must not blank a live page.
    const merged = mergeTranslatedFields(en.data!, { title: "" }, ["title"]);
    expect(merged.title).toBe("Old title");
  });

  it("ignores keys nobody asked for", () => {
    const merged = mergeTranslatedFields(
      en.data!,
      { title: "New title", content: "Model rewrote this unprompted" },
      ["title"],
    );
    expect(merged.content).toBe("Old body");
  });
});

describe("buildChangedFieldPrompt", () => {
  it("shows the model only the changed fields, never the sibling", () => {
    const { system, user } = buildChangedFieldPrompt({
      sourceLang: "Danish",
      targetLang: "English",
      fields: { title: "Ny titel" },
    });
    expect(user).toContain("Ny titel");
    expect(user).not.toContain("Old title");
    expect(system).toContain("EXACTLY the same keys");
  });
});
