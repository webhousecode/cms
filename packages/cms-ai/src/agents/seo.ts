import type { AiProvider } from '../providers/types.js';
import type { Document } from '@webhouse/cms';

export interface SeoResult {
  metaTitle: string;
  metaDescription: string;
  jsonLd: Record<string, unknown>;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export class SeoAgent {
  constructor(private provider: AiProvider) {}

  async optimize(doc: Document, siteTitle: string, baseUrl: string): Promise<SeoResult> {
    const title = String(doc.data['title'] ?? doc.slug);
    const content = String(doc.data['content'] ?? doc.data['body'] ?? '').slice(0, 2000);
    const excerpt = String(doc.data['excerpt'] ?? '');

    const systemPrompt = `You are an SEO expert. Generate optimized meta tags and structured data.`;

    const userPrompt = `Document:
Title: ${title}
Excerpt: ${excerpt}
Content preview: ${content}
Site: ${siteTitle}
URL: ${baseUrl}/${doc.collection}/${doc.slug}/

Generate:
1. metaTitle: SEO-optimized title (50-60 chars)
2. metaDescription: Compelling description (150-160 chars)
3. jsonLd: JSON-LD structured data object (Article schema)

Return ONLY valid JSON like:
{
  "metaTitle": "...",
  "metaDescription": "...",
  "jsonLd": { "@context": "https://schema.org", "@type": "Article", ... }
}`;

    const result = await this.provider.generate(userPrompt, {
      systemPrompt,
      maxTokens: 1024,
      temperature: 0.3,
    });

    let parsed: { metaTitle: string; metaDescription: string; jsonLd: Record<string, unknown> };
    try {
      const cleaned = result.text
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      // Fallback
      parsed = {
        metaTitle: title.slice(0, 60),
        metaDescription: (excerpt || content).slice(0, 160),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: title,
          description: excerpt || content.slice(0, 160),
        },
      };
    }

    return {
      ...parsed,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
      },
    };
  }
}
