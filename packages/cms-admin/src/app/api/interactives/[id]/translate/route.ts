import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { getModel } from "@/lib/ai/model-resolver";
import { LOCALE_LABELS } from "@/lib/locale";
import Anthropic from "@anthropic-ai/sdk";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/interactives/[id]/translate
 * Translates an interactive's HTML content to a target locale.
 * Creates a new interactive with the translated content.
 * Body: { targetLocale: string }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;

  const { id } = await params;
  const { targetLocale } = await req.json() as { targetLocale: string };
  if (!targetLocale) {
    return NextResponse.json({ error: "targetLocale required" }, { status: 400 });
  }

  const adapter = await getMediaAdapter();
  const source = await adapter.getInteractive(id);
  if (!source) {
    return NextResponse.json({ error: "Interactive not found" }, { status: 404 });
  }

  const siteConfig = await readSiteConfig();
  // Detect actual language from HTML lang attribute (more reliable than metadata)
  const htmlLangMatch = source.content.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  const detectedLocale = htmlLangMatch?.[1]?.toLowerCase();
  const sourceLocale = detectedLocale || source.meta.locale || siteConfig.defaultLocale || "en";
  const sourceLang = LOCALE_LABELS[sourceLocale] ?? sourceLocale;
  const targetLang = LOCALE_LABELS[targetLocale] ?? targetLocale;

  // Auto-correct locale from detection + ensure translationGroup BEFORE rejection
  const sourceGroup = source.meta.translationGroup;
  const translationGroupId = sourceGroup || `int-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const needsUpdate = !sourceGroup || (detectedLocale && source.meta.locale !== detectedLocale);
  if (needsUpdate) {
    await adapter.updateInteractive(id, {
      translationGroup: translationGroupId,
      ...(detectedLocale && { locale: detectedLocale }),
    });
  }

  // If source content is already in the target language, flip direction
  // e.g. user clicks "translate to EN" but content is already EN → translate to default locale instead
  let actualTarget = targetLocale;
  if (sourceLocale === targetLocale) {
    const fallback = siteConfig.locales?.find((l: string) => l !== sourceLocale) || siteConfig.defaultLocale || "da";
    if (fallback === sourceLocale) {
      return NextResponse.json({ error: "No other locale available to translate to" }, { status: 400 });
    }
    actualTarget = fallback;
  }
  const actualTargetLang = LOCALE_LABELS[actualTarget] ?? actualTarget;

  // Check if translation already exists (by translationGroup + locale)
  const allInteractives = await adapter.listInteractives();
  const translatedId = `${id}-${actualTarget}`;
  const existing = allInteractives.find(i =>
    (i.translationGroup === translationGroupId && i.locale === actualTarget && i.id !== id) ||
    i.id === translatedId
  );

  // Translate HTML content via AI
  const model = await getModel("content");
  const client = new Anthropic();

  const systemPrompt = `You are a professional translator. Translate the text content in this HTML document from ${sourceLang} to ${actualTargetLang}.
${buildLocaleInstruction(actualTarget)}

CRITICAL RULES:
- Translate ALL visible text: headings, paragraphs, labels, button text, titles, alt attributes, placeholder attributes, aria-labels
- Change the lang attribute on <html> from "${sourceLocale}" to "${actualTarget}"
- Translate the <title> tag content
- PRESERVE EXACTLY: all HTML tags, CSS styles, JavaScript code, class names, IDs, data attributes, URLs, image paths
- Do NOT modify any JavaScript logic, CSS, or structural HTML
- Return the COMPLETE translated HTML document. No explanation, no code fences.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: "user", content: `Translate this HTML interactive from ${sourceLang} to ${actualTargetLang}:\n\n${source.content}` }],
    });

    const translatedHtml = response.content.find(c => c.type === "text")?.text ?? "";
    // Strip markdown code fences if present
    const cleanHtml = translatedHtml.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    if (!cleanHtml.includes("<") || cleanHtml.length < 50) {
      return NextResponse.json({ error: "AI returned invalid HTML" }, { status: 500 });
    }

    if (existing) {
      // Update existing translation
      await adapter.updateInteractive(existing.id, { content: cleanHtml, locale: actualTarget, translationGroup: translationGroupId });
      return NextResponse.json({ id: existing.id, action: "updated" });
    } else {
      // Create new interactive with translated content
      const buffer = Buffer.from(cleanHtml, "utf-8");
      const created = await adapter.createInteractive(`${translatedId}.html`, buffer);
      // Set locale + translationGroup on the new interactive
      await adapter.updateInteractive(created.id, { locale: actualTarget, translationGroup: translationGroupId });
      return NextResponse.json({ id: created.id, action: "created" });
    }
  } catch (err) {
    console.error("[interactive-translate] AI translation failed:", err);
    return NextResponse.json({ error: "AI translation failed" }, { status: 500 });
  }
}
