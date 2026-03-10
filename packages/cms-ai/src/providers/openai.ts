import OpenAI from 'openai';
import type { AiProvider, TextGenerationOptions, TextGenerationResult } from './types.js';

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export class OpenAiProvider implements AiProvider {
  name = 'openai';
  defaultModel = 'gpt-4o';
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env['OPENAI_API_KEY'] });
  }

  estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
    const m = model ?? this.defaultModel;
    const pricing = PRICING[m] ?? PRICING['gpt-4o']!;
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }

  async generate(prompt: string, options: TextGenerationOptions = {}): Promise<TextGenerationResult> {
    const model = options.model ?? this.defaultModel;
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });

    const text = response.choices[0]?.message.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

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
