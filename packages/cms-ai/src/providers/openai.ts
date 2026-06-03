import { createAI, openaiAdapter, type AiClient } from '@broberg/ai-sdk';
import type { AiProvider, TextGenerationOptions, TextGenerationResult } from './types.js';

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export class OpenAiProvider implements AiProvider {
  name = 'openai';
  defaultModel = 'gpt-4o';
  private ai: AiClient;

  constructor(apiKey?: string) {
    // Route through the shared @broberg/ai-sdk facade instead of the raw
    // OpenAI SDK, so all LLM traffic goes through one cost/fallback layer.
    const key = apiKey ?? process.env['OPENAI_API_KEY'];
    this.ai = createAI({
      providers: {
        openai: openaiAdapter(key ? { apiKey: key } : {}),
      },
    });
  }

  estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
    const m = model ?? this.defaultModel;
    const pricing = PRICING[m] ?? PRICING['gpt-4o']!;
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }

  async generate(prompt: string, options: TextGenerationOptions = {}): Promise<TextGenerationResult> {
    const model = options.model ?? this.defaultModel;
    const { text, usage } = await this.ai.chat({
      tier: 'smart',
      override: { provider: 'openai', model, transport: 'http' },
      maxTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
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
      provider: 'openai',
      estimatedCostUsd: this.estimateCost(inputTokens, outputTokens, model),
    };
  }
}
