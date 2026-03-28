import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getApiKey } from "@/lib/ai-config";
import { getSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { buildLocaleInstruction, getSeoLimits } from "@/lib/ai/locale-prompt";
import { getModel } from "@/lib/ai/model-resolver";
import { LOCALE_LABELS } from "@/lib/locale";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/admin/translate-bulk
 *
 * Translates all source documents to a target locale.
 * Body: { targetLocale: string; publish?: boolean }
 * Returns NDJSON stream with progress events.
 */
export async function POST(req: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
  }

  const { targetLocale, publish } = await req.json() as { targetLocale: string; publish?: boolean };
  if (!targetLocale) return NextResponse.json({ error: "targetLocale required" }, { status: 400 });

  const [cms, config, siteConfig, model] = await Promise.all([getAdminCms(), getAdminConfig(), readSiteConfig(), getModel("content")]);

  // Collect all source documents across all collections
  const toTranslate: { collection: string; slug: string; title: string; data: Record<string, unknown>; locale: string }[] = [];

  for (const col of config.collections) {
    const { documents } = await cms.content.findMany(col.name, {});
    for (const doc of documents) {
      const d = doc as any;
      if (d.status === "trashed") continue;
      if (d.translationOf) continue; // skip existing translations
      if (d.locale === targetLocale) continue; // already in target locale

      // Check if translation already exists
      const existingTranslation = (documents as any[]).find(
        t => t.translationOf === d.slug && t.locale === targetLocale
      );
      if (existingTranslation) continue; // already translated

      const titleField = col.fields[0]?.name ?? "title";
      toTranslate.push({
        collection: col.name,
        slug: d.slug,
        title: String(d.data[titleField] ?? d.slug),
        data: d.data,
        locale: d.locale || siteConfig.defaultLocale || "en",
      });
    }
  }

  const total = toTranslate.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ type: "start", total, targetLocale }) + "\n"));

      const client = new Anthropic({ apiKey });
      const TRANSLATABLE_TYPES = new Set(["text", "richtext", "textarea", "slug"]);
      let done = 0;

      for (const item of toTranslate) {
        try {
          const colConfig = config.collections.find(c => c.name === item.collection);
          const translatableFields = colConfig?.fields.filter(f => TRANSLATABLE_TYPES.has(f.type)) ?? [];

          const sourceData: Record<string, string | string[]> = {};
          for (const field of translatableFields) {
            const val = item.data[field.name];
            if (val && typeof val === "string" && val.trim()) {
              sourceData[field.name] = val;
            }
          }

          // Include SEO fields for translation (F48 i18n)
          const sourceSeo = item.data._seo as Record<string, unknown> | undefined;
          let hasSeoToTranslate = false;
          if (sourceSeo) {
            if (typeof sourceSeo.metaTitle === "string" && sourceSeo.metaTitle.trim()) {
              sourceData["_seo_metaTitle"] = sourceSeo.metaTitle;
              hasSeoToTranslate = true;
            }
            if (typeof sourceSeo.metaDescription === "string" && sourceSeo.metaDescription.trim()) {
              sourceData["_seo_metaDescription"] = sourceSeo.metaDescription;
              hasSeoToTranslate = true;
            }
            if (Array.isArray(sourceSeo.keywords) && sourceSeo.keywords.length > 0) {
              sourceData["_seo_keywords"] = sourceSeo.keywords;
              hasSeoToTranslate = true;
            }
          }

          if (Object.keys(sourceData).length === 0) {
            done++;
            controller.enqueue(encoder.encode(JSON.stringify({
              type: "skip", collection: item.collection, slug: item.slug, title: item.title, reason: "no translatable content", done,
            }) + "\n"));
            continue;
          }

          const sourceLang = LOCALE_LABELS[item.locale] ?? item.locale;
          const targetLang = LOCALE_LABELS[targetLocale] ?? targetLocale;
          const seoLimits = getSeoLimits(targetLocale);

          const seoInstruction = hasSeoToTranslate
            ? `\nSEO fields (_seo_metaTitle, _seo_metaDescription, _seo_keywords):
- metaTitle: ${seoLimits.titleMin}-${seoLimits.titleMax} characters for ${targetLang}
- metaDescription: ${seoLimits.descMin}-${seoLimits.descMax} characters for ${targetLang}
- keywords: translate each keyword naturally, keep as array of strings`
            : "";

          const systemPrompt = `You are a professional translator. Translate from ${sourceLang} to ${targetLang}.
${buildLocaleInstruction(targetLocale)}

Preserve:
- HTML tags and formatting exactly as-is
- Proper nouns and brand names
- Meaning, tone, and formatting
- Cultural references should be adapted where relevant
${seoInstruction}
Return ONLY a JSON object with the translated fields. No explanation, no preamble.`;

          const response = await client.messages.create({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: `Translate these fields from ${sourceLang} to ${targetLang}:\n\n${JSON.stringify(sourceData, null, 2)}` }],
          });

          const aiText = response.content.find(c => c.type === "text")?.text ?? "";
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          const translatedData = JSON.parse(jsonMatch?.[0] ?? aiText);

          // Extract translated SEO fields
          const translatedSeo: Record<string, unknown> = {};
          if (translatedData["_seo_metaTitle"]) {
            translatedSeo.metaTitle = translatedData["_seo_metaTitle"];
            delete translatedData["_seo_metaTitle"];
          }
          if (translatedData["_seo_metaDescription"]) {
            translatedSeo.metaDescription = translatedData["_seo_metaDescription"];
            delete translatedData["_seo_metaDescription"];
          }
          if (translatedData["_seo_keywords"]) {
            translatedSeo.keywords = translatedData["_seo_keywords"];
            delete translatedData["_seo_keywords"];
          }

          // Merge translated fields with source data (keep non-translatable fields)
          const mergedData = { ...item.data };
          for (const [key, val] of Object.entries(translatedData)) {
            mergedData[key] = val;
          }

          // Merge SEO: preserve non-translatable SEO fields, override translated ones
          if (Object.keys(translatedSeo).length > 0 && sourceSeo) {
            mergedData._seo = { ...sourceSeo, ...translatedSeo };
          }

          const translationSlug = `${item.slug}-${targetLocale}`;
          await cms.content.create(item.collection, {
            slug: translationSlug,
            data: mergedData,
            status: publish ? "published" : "draft",
            locale: targetLocale,
            translationOf: item.slug,
          });

          done++;
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "result", collection: item.collection, slug: translationSlug,
            title: item.title, targetLocale, done,
          }) + "\n"));
        } catch (err: any) {
          done++;
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "error", collection: item.collection, slug: item.slug,
            title: item.title, error: err?.message ?? "Unknown error", done,
          }) + "\n"));
        }
      }

      controller.enqueue(encoder.encode(JSON.stringify({ type: "done", total, done }) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
