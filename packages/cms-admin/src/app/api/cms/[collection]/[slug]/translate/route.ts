import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { getModel } from "@/lib/ai/model-resolver";
import { LOCALE_LABELS } from "@/lib/locale";
import { GitHubStorageAdapter, generateId } from "@webhouse/cms";
import Anthropic from "@anthropic-ai/sdk";

type Ctx = { params: Promise<{ collection: string; slug: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSessionWithSiteRole();
  if (!session || !session.siteRole || session.siteRole === "viewer") {
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }

  const { collection, slug } = await params;
  const { targetLocale, publish } = (await req.json()) as {
    targetLocale: string;
    publish?: boolean;
  };

  if (!targetLocale) {
    return NextResponse.json(
      { error: "targetLocale is required" },
      { status: 400 },
    );
  }

  const [cms, config, siteConfig] = await Promise.all([
    getAdminCms(),
    getAdminConfig(),
    readSiteConfig(),
  ]);

  // Set Git commit author
  if (cms.storage instanceof GitHubStorageAdapter) {
    cms.storage.setCommitAuthor(session.name, session.email);
  }

  // Get source document
  const sourceDoc = await cms.content.findBySlug(collection, slug);
  if (!sourceDoc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Get collection config for field definitions
  const colConfig = config.collections.find((c) => c.name === collection);
  if (!colConfig) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  // Resolve source and target language labels
  const sourceLocale =
    (sourceDoc as any).locale || siteConfig.defaultLocale || "en";
  const sourceLang = LOCALE_LABELS[sourceLocale] ?? sourceLocale;
  const targetLang = LOCALE_LABELS[targetLocale] ?? targetLocale;

  // Collect translatable fields (text, richtext, textarea, slug, htmldoc, interactive)
  const TRANSLATABLE_TYPES = new Set(["text", "richtext", "textarea", "slug", "htmldoc", "interactive"]);
  const translatableFields = colConfig.fields.filter((f) =>
    TRANSLATABLE_TYPES.has(f.type),
  );

  const sourceData: Record<string, string | string[]> = {};
  for (const field of translatableFields) {
    const val = sourceDoc.data[field.name];
    if (val && typeof val === "string" && val.trim()) {
      sourceData[field.name] = val;
    }
  }
  // Also include the slug for translation
  sourceData["_slug"] = slug;

  // Include SEO fields for translation (F48 i18n)
  const sourceSeo = sourceDoc.data._seo as Record<string, unknown> | undefined;
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
    return NextResponse.json(
      { error: "No translatable content found" },
      { status: 400 },
    );
  }

  // Call AI to translate
  const model = await getModel("content");
  const client = new Anthropic();

  // Import SEO limits for target locale
  const { getSeoLimits } = await import("@/lib/ai/locale-prompt");
  const seoLimits = getSeoLimits(targetLocale);

  const seoInstruction = hasSeoToTranslate
    ? `\nSEO fields (_seo_metaTitle, _seo_metaDescription, _seo_keywords):
- metaTitle: ${seoLimits.titleMin}-${seoLimits.titleMax} characters for ${targetLang}
- metaDescription: ${seoLimits.descMin}-${seoLimits.descMax} characters for ${targetLang}
- keywords: translate each keyword naturally, keep as array of strings`
    : "";

  const systemPrompt = `You are a professional translator. Translate content from ${sourceLang} to ${targetLang}.
${buildLocaleInstruction(targetLocale)}

Preserve:
- HTML tags and formatting exactly as-is
- Proper nouns and brand names
- Meaning, tone, and formatting
- Cultural references should be adapted where relevant
${seoInstruction}
Include a "_slug" field with a URL-friendly translated slug (lowercase, hyphens, no special chars).

Return ONLY a JSON object with the translated fields. No explanation, no preamble.`;

  const userMessage = `Translate these fields from ${sourceLang} to ${targetLang}:\n\n${JSON.stringify(sourceData, null, 2)}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    // Parse translated content
    const aiText =
      response.content.find((c) => c.type === "text")?.text ?? "";
    let translatedData: Record<string, string>;
    try {
      // Extract JSON from response (may have markdown code fence)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      translatedData = JSON.parse(jsonMatch?.[0] ?? aiText);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI translation response" },
        { status: 500 },
      );
    }

    // Use AI-generated slug, fall back to {slug}-{locale}
    const aiSlug = translatedData["_slug"];
    delete translatedData["_slug"];
    const translationSlug = aiSlug
      ? aiSlug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "")
      : `${slug}-${targetLocale}`;

    // Extract translated SEO fields and rebuild _seo object
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

    // Merge: keep non-translatable fields from source, override with translations
    const mergedData = { ...sourceDoc.data };
    for (const [key, val] of Object.entries(translatedData)) {
      mergedData[key] = val;
    }

    // Merge SEO: preserve non-translatable SEO fields (ogImage, canonical, score), override translated ones
    if (Object.keys(translatedSeo).length > 0 && sourceSeo) {
      mergedData._seo = { ...sourceSeo, ...translatedSeo };
    }

    // Replace image alt-text in richtext fields with locale-specific alt from media-meta
    try {
      const { readMediaMeta } = await import("@/lib/media/media-meta");
      const mediaMeta = await readMediaMeta();
      const richtextFields = translatableFields.filter((f) => f.type === "richtext");
      for (const field of richtextFields) {
        const html = mergedData[field.name];
        if (typeof html !== "string" || !html.includes("<img")) continue;
        mergedData[field.name] = html.replace(
          /<img\s+([^>]*?)alt="([^"]*)"([^>]*?)>/gi,
          (match, pre, _alt, post) => {
            // Extract src to find media-meta entry
            const srcMatch = (pre + post).match(/src="([^"]+)"/);
            if (!srcMatch) return match;
            const src = srcMatch[1];
            const key = src.replace(/^\/(api\/)?uploads\//, "");
            const entry = mediaMeta.find((m) => m.key === key);
            if (!entry) return match;
            // Pick target locale alt, fall back to legacy
            const localeAlt = (entry as any).aiAlts?.[targetLocale]
              ?? entry.aiAlt
              ?? _alt;
            return `<img ${pre}alt="${localeAlt.replace(/"/g, "&quot;")}"${post}>`;
          },
        );
      }
    } catch (err) {
      console.error("[translate] Alt-text localization failed (non-fatal):", err);
    }

    // ── translationGroup: bidirectional ID linking ──────────────
    // Ensure source has a translationGroup; create one if missing
    const sourceGroup = (sourceDoc as any).translationGroup as string | undefined;
    const translationGroupId = sourceGroup || generateId();

    // Stamp translationGroup on source if it didn't have one yet
    if (!sourceGroup) {
      await cms.content.update(collection, sourceDoc.id, { translationGroup: translationGroupId });
    }

    // Check if translation already exists (by slug OR by translationGroup + locale)
    const { documents: allDocs } = await cms.content.findMany(collection, {});
    const existingTranslation =
      allDocs.find(d => d.slug === translationSlug) ||
      allDocs.find(d => (d as any).translationGroup === translationGroupId && d.locale === targetLocale && d.id !== sourceDoc.id);

    if (existingTranslation) {
      // Preserve existing status when re-translating (don't force to draft)
      const keepStatus = publish ? "published" : (existingTranslation.status ?? "draft");
      await cms.content.update(collection, existingTranslation.id, {
        data: mergedData,
        status: keepStatus as "draft" | "published" | "archived",
        locale: targetLocale,
        translationGroup: translationGroupId,
      });
      return NextResponse.json({
        slug: existingTranslation.slug,
        action: "updated",
        locale: targetLocale,
      });
    } else {
      const created = await cms.content.create(collection, {
        slug: translationSlug,
        data: mergedData,
        status: publish ? "published" : "draft",
        locale: targetLocale,
        translationGroup: translationGroupId,
      });
      return NextResponse.json({
        slug: created.slug,
        action: "created",
        locale: targetLocale,
      });
    }
  } catch (err) {
    console.error("[translate] AI translation failed:", err);
    return NextResponse.json(
      { error: "AI translation failed" },
      { status: 500 },
    );
  }
}
