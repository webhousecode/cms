export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAiProvider } from './providers/openai.js';
export { ProviderRegistry } from './providers/registry.js';
export type { AiProvider, TextGenerationOptions, TextGenerationResult } from './providers/types.js';
export type { ProviderConfig } from './providers/registry.js';

export { ContentAgent } from './agents/content.js';
export type { GenerateOptions, GenerateResult, RewriteOptions } from './agents/content.js';

export { SeoAgent } from './agents/seo.js';
export type { SeoResult } from './agents/seo.js';

// Orchestrator
export { OrchestratorEngine } from './orchestrator/engine.js';
export { CurationQueue } from './orchestrator/queue.js';
export { AgentRunner } from './orchestrator/runner.js';
export { AgentScheduler } from './orchestrator/scheduler.js';
export type {
  AgentConfig,
  QueueItem,
  CockpitParams,
  OrchestratorResult,
} from './orchestrator/types.js';

// Budget
export { TokenBudgetTracker } from './budget/tracker.js';
export type { BudgetData, BudgetEntry } from './budget/tracker.js';

// Default agents
export { DEFAULT_AGENTS } from './agents/defaults.js';

export async function createAi(config: import('./providers/registry.js').ProviderConfig = {}) {
  const { ProviderRegistry } = await import('./providers/registry.js');
  const { ContentAgent } = await import('./agents/content.js');
  const { SeoAgent } = await import('./agents/seo.js');

  const registry = new ProviderRegistry(config);
  const provider = registry.get();

  return {
    registry,
    content: new ContentAgent(provider),
    seo: new SeoAgent(provider),
  };
}
