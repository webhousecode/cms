import type { AiProvider, TextGenerationOptions } from '../providers/types.js';
import type { CollectionConfig } from '@webhouse/cms';

export interface GenerateOptions extends TextGenerationOptions {
  collection: CollectionConfig;
  locale?: string;
  tone?: string;
  targetAudience?: string;
}

export interface GenerateResult {
  fields: Record<string, string>;
  slug: string;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export interface RewriteOptions extends TextGenerationOptions {
  instruction: string;
  collection: CollectionConfig;
}

export class ContentAgent {
  constructor(private provider: AiProvider) {}

  async generate(prompt: string, options: GenerateOptions): Promise<GenerateResult> {
    const { collection, locale = 'en', tone, targetAudience } = options;

    const fieldDescriptions = collection.fields
      .map(f => {
        const hint = f.ai?.hint ? ` (${f.ai.hint})` : '';
        const maxLen = f.ai?.maxLength ?? f.maxLength;
        const lenHint = maxLen ? ` (max ${maxLen} characters)` : '';
        return `- "${f.name}" (${f.type})${hint}${lenHint}${f.required === true ? ' [required]' : ''}`;
      })
      .join('\n');

    const systemPrompt = [
      `You are a professional content writer creating content for a CMS.`,
      `Collection: ${collection.label ?? collection.name}`,
      tone ? `Tone: ${tone}` : null,
      targetAudience ? `Target audience: ${targetAudience}` : null,
      locale !== 'en' ? `Language: ${locale}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = `Create content for the following request: "${prompt}"

Return a JSON object with these fields:
${fieldDescriptions}

For "richtext" fields, use Markdown formatting.
For "date" fields, use ISO 8601 format (e.g. "${new Date().toISOString()}").
For "slug", generate a URL-friendly slug from the title (lowercase, hyphens).

Return ONLY valid JSON, no explanation, no markdown code blocks.`;

    const result = await this.provider.generate(userPrompt, { ...options, systemPrompt });

    let fields: Record<string, string>;
    try {
      const cleaned = result.text
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      fields = JSON.parse(cleaned) as Record<string, string>;
    } catch {
      throw new Error(`AI returned invalid JSON: ${result.text.slice(0, 200)}`);
    }

    const slug = String(fields['slug'] ?? fields['title'] ?? 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      fields,
      slug,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
      },
    };
  }

  async rewrite(
    currentData: Record<string, unknown>,
    options: RewriteOptions,
  ): Promise<GenerateResult> {
    const { instruction } = options;

    const systemPrompt = `You are a professional content editor. Rewrite the provided content according to the instruction.`;

    const userPrompt = `Current content:
${JSON.stringify(currentData, null, 2)}

Instruction: "${instruction}"

Return a JSON object with the same field names but updated content. Only update fields that are relevant to the instruction. Return ONLY valid JSON.`;

    const result = await this.provider.generate(userPrompt, { ...options, systemPrompt });

    let fields: Record<string, string>;
    try {
      const cleaned = result.text
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      fields = JSON.parse(cleaned) as Record<string, string>;
    } catch {
      throw new Error(`AI returned invalid JSON: ${result.text.slice(0, 200)}`);
    }

    const slug = String(fields['slug'] ?? currentData['slug'] ?? 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      fields,
      slug,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: result.estimatedCostUsd,
      },
    };
  }

  async translate(
    currentData: Record<string, unknown>,
    targetLocale: string,
    options: Partial<TextGenerationOptions> & { collection: CollectionConfig },
  ): Promise<GenerateResult> {
    return this.rewrite(currentData, {
      instruction: `Translate all text content to ${targetLocale}. Keep field names in English. Keep dates, numbers, and URLs unchanged.`,
      ...options,
    });
  }
}
