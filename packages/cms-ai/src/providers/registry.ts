import type { AiProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAiProvider } from './openai.js';

export interface ProviderConfig {
  anthropic?: { apiKey?: string; defaultModel?: string };
  openai?: { apiKey?: string; defaultModel?: string };
  defaultProvider?: 'anthropic' | 'openai';
}

export class ProviderRegistry {
  private providers = new Map<string, AiProvider>();
  private defaultProviderName: string;

  constructor(config: ProviderConfig = {}) {
    if (config.anthropic !== undefined || process.env['ANTHROPIC_API_KEY']) {
      this.providers.set('anthropic', new AnthropicProvider(config.anthropic?.apiKey));
    }
    if (config.openai !== undefined || process.env['OPENAI_API_KEY']) {
      this.providers.set('openai', new OpenAiProvider(config.openai?.apiKey));
    }
    this.defaultProviderName =
      config.defaultProvider ??
      (this.providers.has('anthropic') ? 'anthropic' : 'openai');
  }

  get(name?: string): AiProvider {
    const providerName = name ?? this.defaultProviderName;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(
        `AI provider "${providerName}" not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.`,
      );
    }
    return provider;
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
