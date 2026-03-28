import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { getModel } from "@/lib/ai/model-resolver";
import { LOCALE_LABELS } from "@/lib/locale";
import { GitHubStorageAdapter } from "@webhouse/cms";
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

  // Collect translatable fields (text, richtext, textarea, slug)
  const TRANSLATABLE_TYPES = new Set(["text", "richtext", "textarea", "slug"]);
  const translatableFields = colConfig.fields.filter((f) =>
    TRANSLATABLE_TYPES.has(f.type),
  );

  const sourceData: Record<string, string> = {};
  for (const field of translatableFields) {
    const val = sourceDoc.data[field.name];
    if (val && typeof val === "string" && val.trim()) {
      sourceData[field.name] = val;
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

  const systemPrompt = `You are a professional translator. Translate content from ${sourceLang} to ${targetLang}.
${buildLocaleInstruction(targetLocale)}

Preserve:
- HTML tags and formatting exactly as-is
- Proper nouns and brand names
- Meaning, tone, and formatting
- Cultural references should be adapted where relevant

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

    // Create or update translation document
    const translationSlug = `${slug}-${targetLocale}`;

    // Merge: keep non-translatable fields from source, override with translations
    const mergedData = { ...sourceDoc.data };
    for (const [key, val] of Object.entries(translatedData)) {
      mergedData[key] = val;
    }

    // Check if translation already exists
    let existingTranslation;
    try {
      existingTranslation = await cms.content.findBySlug(
        collection,
        translationSlug,
      );
    } catch {
      /* doesn't exist */
    }

    if (existingTranslation) {
      await cms.content.update(collection, existingTranslation.id, {
        data: mergedData,
        status: publish ? "published" : "draft",
        locale: targetLocale,
        translationOf: slug,
      });
      return NextResponse.json({
        slug: translationSlug,
        action: "updated",
        locale: targetLocale,
      });
    } else {
      const created = await cms.content.create(collection, {
        slug: translationSlug,
        data: mergedData,
        status: publish ? "published" : "draft",
        locale: targetLocale,
        translationOf: slug,
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
