import type { AiProvider } from '../providers/types.js';
import type { AgentConfig, CockpitParams } from './types.js';
import type { CollectionConfig } from '@webhouse/cms';

const FAST_MODEL = 'claude-haiku-4-5-20251001';

function buildFieldDescriptions(collection: CollectionConfig): string {
  return collection.fields
    .map(f => {
      const hint = f.ai?.hint ? ` (${f.ai.hint})` : '';
      const maxLen = f.ai?.maxLength ?? f.maxLength;
      const lenHint = maxLen ? ` (max ${maxLen} characters)` : '';
      return `- "${f.name}" (${f.type})${hint}${lenHint}${f.required === true ? ' [required]' : ''}`;
    })
    .join('\n');
}

function resolveModel(agent: AgentConfig, cockpit: CockpitParams): string {
  if (cockpit.speedQuality === 'fast') {
    // Use haiku unless the user explicitly chose an openai model
    if (cockpit.primaryModel.startsWith('gpt') || cockpit.primaryModel.startsWith('o1')) {
      return cockpit.primaryModel;
    }
    return FAST_MODEL;
  }
  return cockpit.primaryModel;
}

function buildSystemPrompt(
  agent: AgentConfig,
  collection: CollectionConfig,
  cockpit: CockpitParams,
  feedbackExamples?: { original: string; corrected: string }[],
): string {
  const parts: string[] = [];

  // Agent's own system prompt
  parts.push(agent.systemPrompt);

  // Formality / verbosity guidance
  if (agent.behavior.formality > 70) {
    parts.push('Use formal, professional language.');
  } else if (agent.behavior.formality < 30) {
    parts.push('Use casual, conversational language.');
  }
  if (agent.behavior.verbosity > 70) {
    parts.push('Be thorough and detailed in your writing.');
  } else if (agent.behavior.verbosity < 30) {
    parts.push('Be concise and to the point.');
  }

  if (cockpit.promptDepth === 'minimal') {
    // Brief instructions only — no extras
  }

  if (cockpit.promptDepth === 'medium' || cockpit.promptDepth === 'deep') {
    parts.push(`Collection: ${collection.label ?? collection.name}`);
    parts.push(`Fields:\n${buildFieldDescriptions(collection)}`);
  }

  if (cockpit.promptDepth === 'deep') {
    if (cockpit.seoWeight > 50) {
      parts.push(
        `SEO priority: ${cockpit.seoWeight}%. Optimize for search engines: use target keywords naturally in title, headings, and first paragraph. Write a compelling meta description under 160 characters.`,
      );
    }

    if (feedbackExamples && feedbackExamples.length > 0) {
      const examples = feedbackExamples.slice(-3);
      parts.push('Learn from these past corrections:');
      for (const ex of examples) {
        parts.push(`Original: ${ex.original}\nCorrected: ${ex.corrected}`);
      }
    }
  } else if (cockpit.seoWeight > 50) {
    // Even in medium depth, mention SEO if weight is high
    parts.push(`Optimize content for SEO (weight: ${cockpit.seoWeight}%).`);
  }

  if (cockpit.speedQuality === 'thorough') {
    parts.push(
      'After generating the content, review it yourself for accuracy, tone, grammar, and completeness. Fix any issues before returning the final version.',
    );
  }

  return parts.join('\n\n');
}

export class OrchestratorEngine {
  constructor(private provider: AiProvider) {}

  async run(
    prompt: string,
    agent: AgentConfig,
    collection: CollectionConfig,
    cockpit: CockpitParams,
    feedbackExamples?: { original: string; corrected: string }[],
  ): Promise<{ contentData: Record<string, unknown>; slug: string; costUsd: number }> {
    const systemPrompt = buildSystemPrompt(agent, collection, cockpit, feedbackExamples);
    const model = resolveModel(agent, cockpit);

    const fieldDesc = buildFieldDescriptions(collection);
    const userPrompt = `Create content for: "${prompt}"

Return a JSON object with these fields:
${fieldDesc}

For "richtext" fields, use Markdown formatting.
For "date" fields, use ISO 8601 format (e.g. "${new Date().toISOString()}").
For "slug", generate a URL-friendly slug from the title (lowercase, hyphens).

Return ONLY valid JSON, no explanation, no markdown code blocks.`;

    const temperature = agent.behavior.temperature / 100;
    const result = await this.provider.generate(userPrompt, {
      systemPrompt,
      model,
      temperature,
    });

    let contentData: Record<string, unknown>;
    try {
      const cleaned = result.text
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      contentData = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(`AI returned invalid JSON: ${result.text.slice(0, 200)}`);
    }

    const slug = String(contentData['slug'] ?? contentData['title'] ?? 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return {
      contentData,
      slug,
      costUsd: result.estimatedCostUsd,
    };
  }
}
