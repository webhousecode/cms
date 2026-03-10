export interface TextGenerationOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface TextGenerationResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  estimatedCostUsd: number;
}

export interface AiProvider {
  name: string;
  defaultModel: string;
  generate(prompt: string, options?: TextGenerationOptions): Promise<TextGenerationResult>;
  estimateCost(inputTokens: number, outputTokens: number, model?: string): number;
}
