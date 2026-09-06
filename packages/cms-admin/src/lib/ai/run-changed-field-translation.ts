/**
 * F157.14 — the I/O half of "translate only what changed".
 *
 * `planChangedFieldTranslation` decides; this runs it. Kept apart so every
 * guard stays testable without a network, and so the route below reads as one
 * call rather than forty lines of orchestration.
 */
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getModel } from "@/lib/ai/model-resolver";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { LOCALE_LABELS } from "@/lib/locale";
import {
  planChangedFieldTranslation,
  mergeTranslatedFields,
  buildChangedFieldPrompt,
  type LocaleDoc,
} from "./translate-changed-fields";

export type ChangedFieldResult = {
  ok: boolean;
  /** Why nothing happened, when nothing happened. Logged, never thrown. */
  reason?: string;
  targetSlug?: string;
  fields?: string[];
};

/**
 * Propagate an edit's CHANGED fields into one sibling locale.
 *
 * Returns rather than throws: this runs after the response is decided, and a
 * translation that could not happen must never turn a successful save into an
 * error the editor sees.
 */
export async function runChangedFieldTranslation(args: {
  collection: string;
  source: LocaleDoc;
  /** The PATCH body's `data` — exactly the fields this edit carried. */
  changed: Record<string, unknown>;
  targetLocale: string;
  defaultLocale: string;
  autoRetranslateOnUpdate: boolean;
}): Promise<ChangedFieldResult> {
  try {
    const cms = await getAdminCms();
    const config = await getAdminConfig();
    const colConfig = config.collections.find((c) => c.name === args.collection);

    const { documents } = await cms.content.findMany(args.collection, {});
    const siblings = documents as unknown as LocaleDoc[];

    const plan = planChangedFieldTranslation({
      source: args.source,
      changed: args.changed,
      collection: colConfig,
      siblings,
      targetLocale: args.targetLocale,
      defaultLocale: args.defaultLocale,
      autoRetranslateOnUpdate: args.autoRetranslateOnUpdate,
    });

    if (!plan.translate) return { ok: false, reason: plan.reason };

    const sourceLang = LOCALE_LABELS[args.defaultLocale] ?? args.defaultLocale;
    const targetLang = LOCALE_LABELS[args.targetLocale] ?? args.targetLocale;
    const { system, user } = buildChangedFieldPrompt({
      sourceLang,
      targetLang,
      fields: plan.fields,
      localeInstruction: buildLocaleInstruction(args.targetLocale),
    });

    const model = await getModel("content");
    const ai = await getAI();
    const { text } = await ai.chat({
      ...mistralModel(model),
      // Sized to the CHANGED fields, not the document. That is the saving this
      // card is for: a three-word fix no longer sends a whole article.
      maxTokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
      responseFormat: "json",
      purpose: "translate.changed-fields",
    });

    let translated: Record<string, unknown>;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      translated = JSON.parse(match?.[0] ?? text);
    } catch {
      return { ok: false, reason: "could not parse the model's JSON" };
    }

    const requested = Object.keys(plan.fields);
    const mergedData = mergeTranslatedFields(plan.target.data ?? {}, translated, requested);

    await cms.content.update(args.collection, plan.target.id, { data: mergedData });

    return { ok: true, targetSlug: plan.target.slug, fields: requested };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "unknown error" };
  }
}
