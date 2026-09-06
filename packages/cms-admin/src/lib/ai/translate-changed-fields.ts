/**
 * F157.14 — translate ONLY the fields an edit actually touched.
 *
 * Christian: "Når jeg med inline-editing ændrer en tekst på en dansk side …
 * så skal cms bagved automatisk sikre at det engelske dokument er current."
 *
 * The existing POST .../translate route re-translates the WHOLE document and
 * writes the result as the sibling's full `data`. That is right on publish and
 * harmful on an inline edit: a hand-polished English headline is thrown away —
 * silently — the next time anyone fixes a comma on the Danish page, and three
 * edited words cost a full-article LLM call.
 *
 * A PATCH is already field-granular: `body.data` carries exactly the fields the
 * call changes. So "which paragraph did he edit" is already in the request; no
 * diffing is needed. This module translates just those, and MERGES them into
 * the sibling's existing data instead of replacing it.
 */
import type { CollectionConfig, FieldConfig } from "@webhouse/cms";
import { TRANSLATABLE_TYPES, isNonProse } from "./translation-helpers";

/** A document as far as this module is concerned. */
export type LocaleDoc = {
  id: string;
  slug: string;
  locale?: string;
  translationGroup?: string;
  data?: Record<string, unknown>;
};

export type ChangedFieldPlan =
  | {
      translate: false;
      reason: string;
      /**
       * TRUE only when the sole thing missing is the sibling document — the one
       * case where falling back to the whole-document route is right, because
       * that route CREATES it.
       *
       * A boolean rather than the caller matching on `reason` text. The first
       * version did match the text (`reason.startsWith("no ")`) and three
       * different reasons begin that way: "no target locale", "no en sibling"
       * and "no translatable field changed". So a DELIBERATE refusal — a
       * changed date, say — triggered a full re-translation of the entire
       * document, which is exactly the damage this module exists to prevent.
       * Caught in production by the end-to-end check, not by a test.
       */
      missingSibling: boolean;
    }
  | {
      translate: true;
      /** The sibling to write into. */
      target: LocaleDoc;
      /** Field name → source value, only the translatable ones that changed. */
      fields: Record<string, string | string[]>;
    };

/**
 * Decide whether an edit should propagate to a sibling locale, and with which
 * fields. Pure — no I/O — so every guard below is testable without a network.
 *
 * The guards are the point. Each one is a way this feature could quietly do
 * damage rather than quietly do nothing:
 *
 * - OFF unless the owner turned it on. The switch is his.
 * - Source must be the DEFAULT locale. Without this an edit on the English page
 *   writes back into the Danish one, and the two take turns overwriting each
 *   other — the worst outcome available here, because both look "saved".
 * - Sibling found by translationGroup, never by a `${slug}-${locale}` guess.
 *   Measured on webhouse-site 2026-08-24: a slug that survives translation
 *   unchanged makes the twin want the SOURCE's own address, and translating
 *   globals/site overwrote the English document in place.
 * - Only translatable field TYPES. A changed date, number or URL must not cost
 *   an LLM call.
 * - Only fields that actually DIFFER from what is stored. A save that re-sends
 *   an unchanged value is not an edit of it.
 */
export function planChangedFieldTranslation(args: {
  source: LocaleDoc;
  changed: Record<string, unknown>;
  collection: CollectionConfig | undefined;
  siblings: LocaleDoc[];
  targetLocale: string;
  defaultLocale: string;
  autoRetranslateOnUpdate: boolean;
}): ChangedFieldPlan {
  const { source, changed, collection, siblings, targetLocale, defaultLocale } = args;

  if (!args.autoRetranslateOnUpdate) return refuse("auto-retranslate is off");

  // The circular guard runs FIRST, and the order is load-bearing rather than
  // stylistic. Asking "may this source propagate at all?" before "is there a
  // target?" is the more fundamental question — and with the checks the other
  // way round, an edit on the English page was rejected by the target check and
  // the circular guard was never reached. Both answers were "no", so the
  // behaviour looked right while the guard that matters was untested. Its own
  // test now pins the REASON, not just the refusal.
  const sourceLocale = source.locale || defaultLocale;
  if (sourceLocale !== defaultLocale) {
    return refuse(`source locale ${sourceLocale} is not the default`);
  }

  if (!targetLocale || targetLocale === defaultLocale) {
    return refuse("no target locale");
  }

  const group = source.translationGroup;
  if (!group) return refuse("source has no translationGroup");

  const target = siblings.find(
    (d) => d.translationGroup === group && d.locale === targetLocale && d.id !== source.id,
  );
  // No sibling is NORMAL — an article that has never been translated is not an
  // error, so this does nothing rather than creating a page nobody asked for.
  if (!target) return { translate: false, reason: `no ${targetLocale} sibling`, missingSibling: true };

  const byName = new Map<string, FieldConfig>(
    ((collection?.fields ?? []) as FieldConfig[]).map((f) => [f.name, f]),
  );
  const stored = source.data ?? {};
  const fields: Record<string, string | string[]> = {};

  for (const [name, value] of Object.entries(changed)) {
    const def = byName.get(name);

    // A field the SCHEMA does not know is judged on its value instead of
    // skipped. Measured on broberg.ai 2026-09-06: all nine collections declare
    // ZERO fields, so a type lookup answers "unknown" for every field on the
    // site — including `title`. Skipping the unknown meant the feature could
    // never fire there, and the same blindness sits in the whole-document
    // route, where it was simply never noticed because the switch was off.
    //
    // Deliberately a fallback, not the rule: a declared type is a FACT and a
    // value is a GUESS, so the schema still wins wherever it has an answer.
    if (!def) {
      if (typeof value !== "string") continue;
      const t = value.trim();
      if (t.length === 0) continue;
      if (UNDECLARED_METADATA.test(name)) continue;
      if (isNonProse(name, t)) continue;
      if (typeof stored[name] === "string" && (stored[name] as string).trim() === t) continue;
      fields[name] = value;
      continue;
    }

    if (!TRANSLATABLE_TYPES.has(def.type)) continue;

    if (def.type === "tags") {
      if (!Array.isArray(value)) continue;
      const cleaned = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (cleaned.length === 0) continue;
      if (sameStringArray(cleaned, stored[name])) continue;
      fields[name] = cleaned;
      continue;
    }

    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    // A slug or a bare token is not prose; translating it produces a worse value.
    if (isNonProse(name, trimmed)) continue;
    if (typeof stored[name] === "string" && (stored[name] as string).trim() === trimmed) continue;
    fields[name] = value;
  }

  if (Object.keys(fields).length === 0) {
    return refuse("no translatable field changed");
  }
  return { translate: true, target, fields };
}

/**
 * Metadata field names that must never be translated when the schema cannot
 * tell us their type. `isNonProse` already covers the ones whose VALUE gives
 * them away — a URL, a path, a hex colour, a lowercase-hyphenated token, and
 * names like href/slug/id. These are the ones whose value looks like ordinary
 * prose while the field is plainly not:
 *
 *   author "broberg.ai"  ·  a byline is a name, not a sentence
 *   locale "da"          ·  translating it would repoint the document
 *   status "published"   ·  a state machine value
 *
 * Kept SHORT on purpose. Every name added here is a field that can never be
 * translated on a schema-less site, and the earlier version of the non-prose
 * list is the cautionary tale: it swallowed "Services" and "About" — real
 * navigation labels — by being too eager. A missed metadata field is a wrong
 * word in one place; an over-broad rule silently refuses to translate the site.
 */
const UNDECLARED_METADATA =
  /^(author|byline|locale|lang|language|status|state|collection|createdAt|updatedAt|publishedAt|date|datetime|timestamp|category|tag|version|sku|code|currency|email|phone|tel)$/i;

/** A deliberate refusal: nothing is missing, so nothing should be created. */
function refuse(reason: string): ChangedFieldPlan {
  return { translate: false, reason, missingSibling: false };
}

function sameStringArray(a: string[], b: unknown): boolean {
  if (!Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Merge translated values into the sibling's EXISTING data.
 *
 * This is the half that protects hand-written work: every field the edit did
 * not touch is carried across by reference from the sibling, unchanged. The
 * whole-document route cannot do this — it rebuilds `data` from the source.
 *
 * Only keys the model actually returned are written. A field it declined to
 * translate keeps the sibling's current value rather than becoming empty.
 */
export function mergeTranslatedFields(
  targetData: Record<string, unknown>,
  translated: Record<string, unknown>,
  requested: string[],
): Record<string, unknown> {
  const out = { ...targetData };
  for (const name of requested) {
    const value = translated[name];
    if (typeof value === "string" && value.trim().length > 0) out[name] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[name] = value;
  }
  return out;
}

/**
 * The prompt. Deliberately narrow: the model is shown ONLY the changed fields
 * and told to return the same keys. It is never shown the sibling document, so
 * it cannot be tempted to "improve" text it was not asked about.
 */
export function buildChangedFieldPrompt(args: {
  sourceLang: string;
  targetLang: string;
  fields: Record<string, string | string[]>;
  localeInstruction?: string;
}): { system: string; user: string } {
  const system = [
    `You translate CMS field values from ${args.sourceLang} to ${args.targetLang}.`,
    "",
    "Return ONLY a JSON object with EXACTLY the same keys you were given.",
    "Translate the VALUES. Never translate, invent or drop a key.",
    "Preserve Markdown, HTML tags, links and formatting exactly as they appear.",
    "Keep proper nouns, product names and code identifiers unchanged.",
    args.localeInstruction ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    "Translate these field values:",
    "",
    JSON.stringify(args.fields, null, 2),
  ].join("\n");

  return { system, user };
}
