import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getApiKey } from "@/lib/ai-config";
import Anthropic from "@anthropic-ai/sdk";
import type { SeoFields } from "@/lib/seo/score";

/**
 * POST /api/admin/seo/optimize-bulk
 *
 * AI-optimizes SEO for all documents that are missing _seo fields.
 * Optional body: { slugs: ["collection/slug", ...] } to limit scope.
 * Returns NDJSON stream with progress events.
 */
export async function POST(req: NextRequest) {
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
  }

  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
  const client = new Anthropic({ apiKey });

  // Optional filter
  let targetSlugs: Set<string> | null = null;
  try {
    const body = await req.json() as { slugs?: string[] };
    if (body.slugs?.length) targetSlugs = new Set(body.slugs);
  } catch { /* no body = all */ }

  // Collect docs to optimize
  const toOptimize: Array<{ collection: string; slug: string; id: string; title: string; content: string; data: Record<string, unknown> }> = [];

  for (const col of config.collections) {
    try {
      const { documents } = await cms.content.findMany(col.name, {});
      for (const doc of documents) {
        if ((doc.status as string) === "trashed") continue;
        const data = (doc as { data?: Record<string, unknown> }).data ?? {};
        const seo = data._seo as SeoFields | undefined;

        const key = `${col.name}/${doc.slug}`;
        if (targetSlugs && !targetSlugs.has(key)) continue;
        if (!targetSlugs && seo?.lastOptimized) continue; // skip already optimized

        toOptimize.push({
          collection: col.name,
          slug: doc.slug,
          id: doc.id,
          title: String(data.title ?? data.name ?? doc.slug),
          content: String(data.content ?? data.body ?? "").slice(0, 2000),
          data,
        });
      }
    } catch { /* skip */ }
  }

  // Stream results as NDJSON
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ type: "start", total: toOptimize.length }) + "\n"));

      let done = 0;
      for (const doc of toOptimize) {
        try {
          const message = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: "You generate SEO metadata. Return ONLY a JSON object, no explanation.",
            messages: [{
              role: "user",
              content: `Generate SEO for this page:
Title: ${doc.title}
Content: ${doc.content}

Return JSON:
{
  "metaTitle": "SEO title (30-60 chars, MUST include the primary keyword)",
  "metaDescription": "description (130-155 chars, MUST include the primary keyword)",
  "keywords": ["primary-keyword", "kw2", "kw3", "kw4", "kw5"]
}`,
            }],
          });

          const raw = (message.content[0] as { text: string }).text.trim();
          const parsed = JSON.parse(raw.replace(/^```json?\n?/, "").replace(/\n?```$/, ""));

          // Auto-extract OG image
          const rawContent = String(doc.data.content ?? doc.data.body ?? "");
          const fieldImg = String(doc.data.heroImage ?? doc.data.coverImage ?? doc.data.image ?? "");
          let ogImage = "";
          if (fieldImg && fieldImg.startsWith("/uploads/")) {
            ogImage = fieldImg;
          } else {
            const mdMatch = rawContent.match(/!\[[^\]]*\]\((\/uploads\/[^\s"]+)/);
            if (mdMatch) ogImage = mdMatch[1];
          }

          const seoUpdate: SeoFields = {
            metaTitle: parsed.metaTitle,
            metaDescription: parsed.metaDescription,
            keywords: parsed.keywords,
            ogImage: ogImage || undefined,
            lastOptimized: new Date().toISOString(),
          };

          // Save to document
          const existing = (doc.data._seo as Record<string, unknown>) ?? {};
          await cms.content.update(doc.collection, doc.id, {
            data: { ...doc.data, _seo: { ...existing, ...seoUpdate } },
          });

          done++;
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "result",
            collection: doc.collection,
            slug: doc.slug,
            title: doc.title,
            score: 0, // will be recalculated on next load
            done,
          }) + "\n"));
        } catch (err) {
          done++;
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "error",
            collection: doc.collection,
            slug: doc.slug,
            error: err instanceof Error ? err.message : "Failed",
            done,
          }) + "\n"));
        }
      }

      controller.enqueue(encoder.encode(JSON.stringify({ type: "done", total: toOptimize.length, done }) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
