/**
 * Central @broberg/ai-sdk client for cms-admin.
 *
 * SINGLE SOURCE for every LLM/AI call in the CMS. No route, lib, or tool may
 * `new Anthropic()`, import `@ai-sdk/*`, or `fetch()` a provider host directly —
 * they all go through `getAI()`. This gives us one cost-tracking sink, one
 * fallback story, and per-tenant BYO-key resolution in one place.
 *
 * Model selection stays in `model-resolver.ts` (getModel(purpose)); pass the
 * resolved model string into `anthropicModel(model)` to pin it 1:1 per call.
 */
import {
  createAI,
  anthropicAdapter,
  geminiAdapter,
  openaiAdapter,
  upmetricsSink,
  noopSink,
  parseJsonLoose,
  type AiClient,
  type CostSink,
  type ProviderAdapter,
  type Tier,
  type TierSpec,
} from "@broberg/ai-sdk";
import { readAiConfig } from "@/lib/ai-config";

/** Cost sink: forward usage to upmetrics when the cost-ingest key is present,
 *  else a no-op. The DSN (NEXT_PUBLIC_UPMETRICS_DSN, error/RUM) is a SEPARATE
 *  key/endpoint and is untouched here. */
function buildCostSink(): CostSink {
  const apiKey = process.env.UPMETRICS_API_KEY;
  if (!apiKey) return noopSink;
  return upmetricsSink({
    baseUrl: process.env.UPMETRICS_BASE_URL || "https://upmetrics.org",
    apiKey,
    agentName: "cms",
  });
}

/**
 * Build an AiClient from explicit provider keys. Use this when the caller has
 * already resolved keys for a SPECIFIC tenant WITHOUT cookies (e.g. the MCP
 * endpoint, which resolves the site from an API key, not the cookie-active
 * site). Passing keys directly avoids re-resolving against the wrong tenant.
 */
export function createAIWithKeys(keys: {
  anthropic?: string;
  gemini?: string;
  openai?: string;
}): AiClient {
  const providers: Record<string, ProviderAdapter> = {
    anthropic: anthropicAdapter({ apiKey: keys.anthropic }),
    gemini: geminiAdapter({ apiKey: keys.gemini }),
    openai: openaiAdapter({ apiKey: keys.openai }),
  };
  return createAI({ costSink: buildCostSink(), providers });
}

/**
 * Build an AiClient bound to the active tenant's provider keys.
 *
 * Keys resolve via `readAiConfig()` (site → org → env), preserving the CMS's
 * BYO-key model — the SDK's default registry would only read env vars and would
 * ignore per-tenant keys, so we inject resolved keys into the adapters.
 *
 * Per-request construction is intentional: it's cheap object creation and keeps
 * tenant keys request-scoped (no process-wide state, no cross-tenant leak).
 */
export async function getAI(): Promise<AiClient> {
  const cfg = await readAiConfig().catch(() => null);
  return createAIWithKeys({
    anthropic: cfg?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    gemini:
      cfg?.geminiApiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openai: cfg?.openaiApiKey ?? process.env.OPENAI_API_KEY,
  });
}

type ModelOpts = { tier: Tier; override: TierSpec };

/** Pin an Anthropic model 1:1 for a single call. Spread into chat/chatStream:
 *  `ai.chat({ messages, ...anthropicModel(model) })`. */
export function anthropicModel(model: string): ModelOpts {
  return { tier: "smart", override: { provider: "anthropic", model, transport: "http" } };
}

/** Pin a Gemini model 1:1 (vision / image). */
export function geminiModel(model: string): ModelOpts {
  return { tier: "vision", override: { provider: "gemini", model, transport: "http" } };
}

export { parseJsonLoose };
