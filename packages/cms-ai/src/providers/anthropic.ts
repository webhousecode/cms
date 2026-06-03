import { createAI, anthropicAdapter, type AiClient } from '@broberg/ai-sdk';
import type { AiProvider, TextGenerationOptions, TextGenerationResult } from './types.js';

// Pricing per 1M tokens (USD) — as of early 2026
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
};

export class AnthropicProvider implements AiProvider {
  name = 'anthropic';
  defaultModel = 'claude-sonnet-4-6';
  private ai: AiClient;

  constructor(apiKey?: string) {
    // Route through the shared @broberg/ai-sdk facade instead of the raw
    // Anthropic SDK, so all LLM traffic goes through one cost/fallback layer.
    const key = apiKey ?? process.env['ANTHROPIC_API_KEY'];
    this.ai = createAI({
      providers: {
        anthropic: anthropicAdapter(key ? { apiKey: key } : {}),
      },
    });
  }

  estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
    const m = model ?? this.defaultModel;
    const pricing = PRICING[m] ?? PRICING['claude-sonnet-4-6']!;
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }

  async generate(prompt: string, options: TextGenerationOptions = {}): Promise<TextGenerationResult> {
    const model = options.model ?? this.defaultModel;
    const { text, usage } = await this.ai.chat({
      tier: 'smart',
      override: { provider: 'anthropic', model, transport: 'http' },
      maxTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      system: options.systemPrompt ?? 'You are a helpful content writer.',
      messages: [{ role: 'user', content: prompt }],
      purpose: 'cms-ai.generate',
    });

    const inputTokens = usage.inputTokens;
    const outputTokens = usage.outputTokens;

    return {
      text,
      inputTokens,
      outputTokens,
      model,
      provider: 'anthropic',
      estimatedCostUsd: this.estimateCost(inputTokens, outputTokens, model),
    };
  }
}
