# F135 — OpenRouter AI Fallback

**Status:** Draft
**Requested:** 2026-04-21 by Christian
**Effort estimate:** 1–2d
**Tier:** 2 — Competitive Edge

---

## Problem

`@webhouse/cms` har i dag **ingen fallback** for AI-kald udover vision (Anthropic → Gemini). Når Anthropic er nede, rammer rate limits, eller API nøglen er ugyldig, fejler:

- Content generation
- Chat i editoren
- Translation (enkelt + bulk)
- SEO bulk optimization
- Proofreading
- HTML editing
- Config diagnose/auto-fix

F130 (whai-gateway) adresserer dette med en **lokal** Gemma 4 model via Ollama — men kræver infrastruktur (Ollama, Docker, GPU). F135 giver et **cloud-baseret** alternativ der virker øjeblikkeligt uden opsætning.

---

## Vision

OpenRouter som primær cloud-fallback for alle CMS AI-kald:

- **Én API key** — adgang til 100+ modeller gennem ét endpoint
- **Pay-per-use** — ingen subscription lock-in
- **Ingen infrastructure** — ingen Ollama, Docker, eller GPU nødvendig
- **Komplementerer F130** — OpenRouter er cloud-fallback, whai-gateway er lokal fallback

```
Content/Translation/SEO/Chat:
  Anthropic (site key) → [fail] → OpenRouter (MiniMax M2.7) → [fail] → whai-gateway (F130)

Vision:
  Anthropic Sonnet → [fail] → OpenRouter (GPT-4o vision) → [fail] → Gemini

Image generation:
  Gemini 3 Pro (behold — ingen god alternativ)
```

---

## Architecture

### Provider registry udvidelse

```typescript
// packages/ai/src/registry.ts
export const models = {
  fast:     { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
  smart:    { provider: 'anthropic', id: 'claude-sonnet-4-6' },
  powerful: { provider: 'anthropic', id: 'claude-opus-4-6' },
  local:    { provider: 'whai',      id: 'gemma4:e4b' },        // F130
  cloud:    { provider: 'openrouter', id: 'minimax/minimax-m2.7' }, // F135
};
```

### OpenRouter adapter

```typescript
// packages/ai/src/providers/openrouter.ts
export class OpenRouterProvider {
  async generate(prompt: string, options?: GenerateOptions) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://webhouse.app',
        'X-Title': '@webhouse/cms',
      },
      body: JSON.stringify({
        model: options?.model || 'minimax/minimax-m2.7',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxTokens || 4096,
      }),
    })
    // Parse → text response
  }
}
```

### Fallback chain i @webhouse/ai

```typescript
// packages/ai/src/fallback.ts
export async function withFallback<T>(
  primary: () => Promise<T>,
  cloud: () => Promise<T>,    // OpenRouter (F135)
  local: () => Promise<T>,    // whai-gateway (F130)
): Promise<T> {
  try { return await primary() } catch { /* fall through */ }
  try { return await cloud() } catch { /* fall through */ }
  try { return await local() } catch { /* fall through */ }
  throw new Error('All AI providers exhausted')
}
```

### AI config udvidelse

```typescript
// cms-admin/src/lib/ai-config.ts
interface AiConfig {
  defaultProvider: 'anthropic' | 'openrouter' | 'gemini' | 'whai'
  anthropicApiKey?: string
  openrouterApiKey?: string    // NY
  openrouterModel?: string     // NY, default: 'minimax/minimax-m2.7'
  geminiApiKey?: string
  // ...
}
```

### Fallback routing per task type

| Task type | Primary | Fallback 1 | Fallback 2 |
|-----------|---------|------------|------------|
| Content generation | Anthropic Haiku | OpenRouter (MiniMax) | whai-gateway |
| Chat (streaming) | Anthropic Sonnet | OpenRouter (Qwen3) | — |
| Translation | Anthropic Haiku | OpenRouter (MiniMax) | whai-gateway |
| SEO bulk | Anthropic Haiku | OpenRouter (MiniMax) | whai-gateway |
| Proofreading | Anthropic Haiku | OpenRouter (MiniMax) | — |
| HTML editing | Anthropic Sonnet | OpenRouter (Qwen3) | — |
| Vision | Anthropic Sonnet | OpenRouter (GPT-4o) | Gemini |
| Image generation | Gemini 3 Pro | — | — |
| Config diagnose | Anthropic Sonnet | OpenRouter (Qwen3) | — |

---

## Environment configuration

| Env | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Required for cloud fallback |
| `OPENROUTER_MODEL` | `minimax/minimax-m2.7` | Default model for content tasks |
| `OPENROUTER_VISION_MODEL` | `openai/gpt-4o` | Model for vision tasks |
| `OPENROUTER_CHAT_MODEL` | `qwen/qwen3.6-plus` | Model for chat/streaming |
| `AI_FALLBACK_ENABLED` | `true` | Enable fallback chain |
| `AI_FALLBACK_TIMEOUT_MS` | `30000` | Timeout per provider |

---

## Impact Analysis

**Positive**
- Anthropic outages påvirker ikke CMS AI features — fallback er øjeblikkelig
- Ingen infrastruktur nødvendig — virker med det samme
- Pay-per-use — kun betaling ved faktisk brug
- Komplementerer F130 (lokal) — to fallback-lag
- OpenRouter har 100+ modeller — kan skifte model uden at ændre kode

**Negative / risks**
- OpenRouter latency er højere end Anthropic (~2-4s vs ~1s)
- OpenRouter koster penge — skal trackes i budget
- Nogle modeller på OpenRouter er ustabile — skal monitoreres
- Vision kvalitet kan variere mellem providers

---

## Implementation Steps

### Phase A — OpenRouter adapter (0.5d)

- [ ] `packages/ai/src/providers/openrouter.ts` — OpenRouterProvider klasse
- [ ] `packages/ai/src/registry.ts` — tilføj `cloud` tier
- [ ] `packages/cms-admin/src/lib/ai-config.ts` — openrouterApiKey + model felter
- [ ] Settings UI: AI config panel med OpenRouter key input

### Phase B — Fallback chain (0.5d)

- [ ] `packages/ai/src/fallback.ts` — `withFallback()` helper
- [ ] Wire content generation til fallback chain
- [ ] Wire translation til fallback chain
- [ ] Wire SEO bulk til fallback chain
- [ ] Dashboard: vis hvilken provider der blev brugt

### Phase C — Vision fallback (0.5d)

- [ ] `packages/cms-admin/src/lib/ai/image-analysis.ts` — OpenRouter vision som fallback
- [ ] Test med GPT-4o vision model
- [ ] Opdater `media/analyze` route til at vise provider

---

## Dependencies

- F130 (whai-gateway) — lokal fallback, supplerer OpenRouter
- `@webhouse/ai` package — skal udvides med OpenRouter provider
- OpenRouter API key (allerede sat i Christian's `~/.bashrc`)
- Ingen nye betalte services udover OpenRouter pay-per-use

---

## Open Questions

1. **Model selection.** Hvilken model som standard? MiniMax M2.7 har gode coding benchmarks, men Qwen3.6-plus er også stærk. → Start med MiniMax M2.7, gør det konfigurerbart.

2. **Cost tracking.** Skal dashboard vise OpenRouter forbrug? → Ja, track provider i DB. Vis samlet cost per måned.

3. **Circuit breaker.** Skal vi poll `status.anthropic.com` og automatisk switch til OpenRouter? → Start med simpel error-based fallback. Circuit breaker kan tilføjes senere.

4. **Streaming.** OpenRouter understøtter streaming. Skal chat routes bruge det? → Ja, chat routes bør supportere SSE streaming fra OpenRouter.

5. **Fallback order.** Skal rækkefølgen være Anthropic → OpenRouter → whai-gateway, eller Anthropic → whai-gateway → OpenRouter? → Anthropic → OpenRouter → whai-gateway (cloud før lokal, da cloud er hurtigere at falde back til).

---

## Decisions log

| Date | Decision |
|---|---|
| 2026-04-21 | OpenRouter er cloud-fallback, F130 (whai-gateway) er lokal fallback. De supplerer hinanden. |
| 2026-04-21 | Image generation (Gemini 3 Pro) har ingen fallback — behold Google. |
| 2026-04-21 | Fallback order: Anthropic → OpenRouter → whai-gateway. |

---

## Ties to other docs

- [`F130-ai-fallback-gateway.md`](F130-ai-fallback-gateway.md) — lokal fallback (Gemma 4 via Ollama)
- [`F114-chat-memory.md`](F114-chat-memory.md) — chat memory der kan bruge OpenRouter fallback
- [`F107-chat-with-your-site.md`](F107-chat-with-your-site.md) — site chat der kan bruge OpenRouter
- [`ROADMAP.md`](../ROADMAP.md) — F135 er Tier 2, Competitive Edge
