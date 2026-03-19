# F11 — Multi-Model AI

> Support multiple AI providers and model tiers with per-agent selection and cost tracking.

## Problem

The CMS currently supports Anthropic and OpenAI but has no model tier system. All agents use the same model. There is no way to assign cheaper models to simple tasks and expensive models to complex ones. No cost tracking or fallback on failure.

## Solution

A model tier system (Simple/Advanced/Expert) with per-agent model selection, automatic fallback chains, cost tracking per model, and A/B testing for content quality comparison.

## Technical Design

### Model Registry

```typescript
// packages/cms-ai/src/providers/registry.ts

export type ModelTier = 'simple' | 'advanced' | 'expert';

export interface ModelConfig {
  id: string;                // e.g. 'anthropic:claude-haiku-4'
  provider: 'anthropic' | 'openai' | 'google';
  model: string;             // API model name
  tier: ModelTier;
  displayName: string;
  costPer1kInput: number;    // USD
  costPer1kOutput: number;   // USD
  maxTokens: number;
  supportsVision: boolean;
}

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'anthropic:claude-haiku-4',
    provider: 'anthropic', model: 'claude-haiku-4-20250314',
    tier: 'simple', displayName: 'Claude Haiku 4',
    costPer1kInput: 0.0008, costPer1kOutput: 0.004,
    maxTokens: 8192, supportsVision: true,
  },
  {
    id: 'anthropic:claude-sonnet-4',
    provider: 'anthropic', model: 'claude-sonnet-4-20250514',
    tier: 'advanced', displayName: 'Claude Sonnet 4',
    costPer1kInput: 0.003, costPer1kOutput: 0.015,
    maxTokens: 8192, supportsVision: true,
  },
  {
    id: 'anthropic:claude-opus-4',
    provider: 'anthropic', model: 'claude-opus-4-20250514',
    tier: 'expert', displayName: 'Claude Opus 4',
    costPer1kInput: 0.015, costPer1kOutput: 0.075,
    maxTokens: 4096, supportsVision: true,
  },
];

export class ModelRegistry {
  getByTier(tier: ModelTier): ModelConfig[];
  getById(id: string): ModelConfig | undefined;
  getFallbackChain(id: string): ModelConfig[];
}
```

### Cost Tracking

```typescript
// packages/cms-ai/src/budget/cost-tracker.ts

export interface UsageRecord {
  id: string;
  modelId: string;
  agentId: string;
  collection: string;
  documentSlug?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: string;
}

export class CostTracker {
  async record(usage: Omit<UsageRecord, 'id' | 'timestamp'>): Promise<void>;
  async getSummary(period: 'day' | 'week' | 'month'): Promise<{
    totalCost: number;
    byModel: Record<string, number>;
    byAgent: Record<string, number>;
  }>;
}
```

Stored at `<dataDir>/ai-usage.jsonl` (append-only log).

### Per-Agent Model Selection

```typescript
// Extend AgentConfig in packages/cms-admin/src/lib/agents.ts
export interface AgentConfig {
  // ... existing fields
  modelTier?: ModelTier;      // default: 'advanced'
  modelOverride?: string;     // specific model ID override
}
```

### Admin UI

- Model selector dropdown on agent edit page
- Cost dashboard at `/admin/settings/ai-costs` showing usage by model, agent, and time period
- A/B comparison UI: generate same content with two models, show side-by-side

## Impact Analysis

### Files affected
- `packages/cms-ai/src/providers/registry.ts` — new model registry with tiers
- `packages/cms-ai/src/budget/cost-tracker.ts` — new cost tracking module
- `packages/cms-admin/src/lib/agents.ts` — add `modelTier`/`modelOverride` to AgentConfig
- `packages/cms-admin/src/app/admin/settings/ai-costs/page.tsx` — new cost dashboard
- `packages/cms-ai/src/providers/` — update all providers for model selection

### Blast radius
- AI provider system is used by all agents — model selection changes affect every AI call
- Cost tracking adds overhead to every AI request

### Breaking changes
- `AgentConfig` interface extended — existing agents default to `advanced` tier

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Per-agent model selection works
- [ ] Fallback chain activates on primary model failure
- [ ] Cost tracked per request
- [ ] Cost dashboard shows accurate data

## Implementation Steps

1. Create `packages/cms-ai/src/providers/registry.ts` with model definitions
2. Update `packages/cms-ai/src/providers/` to support model selection per call
3. Create `packages/cms-ai/src/budget/cost-tracker.ts` with JSONL append storage
4. Add `modelTier` and `modelOverride` to `AgentConfig`
5. Implement fallback chain: if primary model fails, try next tier down
6. Update agent runner to select model based on agent config
7. Record usage after every AI call
8. Build cost dashboard page at `packages/cms-admin/src/app/admin/settings/ai-costs/page.tsx`
9. Add model selector (CustomSelect) to agent edit page
10. Build A/B comparison feature: button to regenerate with different model, side-by-side diff view

## Dependencies

- Existing AI provider system in `packages/cms-ai/src/providers/`
- Existing budget system in `packages/cms-ai/src/budget/`

## Effort Estimate

**Medium** — 3-4 days
