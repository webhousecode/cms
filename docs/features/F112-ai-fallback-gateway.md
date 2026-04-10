# F112 — AI Fallback Gateway (Local Gemma 4)

> A self-hosted TypeScript API that wraps a local Gemma 4 model and exposes a uniform interface to `@webhouse/cms`. Used for cheap/simple generation tasks and as an automatic fallback when Anthropic is degraded or down.

## Problem

`@webhouse/cms` increasingly relies on Anthropic's API for text, code, HTML and CSS generation across features like F111 (External Publishing), the GEO plan (G01–G08), the Voice module, and Image AI captions. Two issues are becoming pressing:

1. **Anthropic reliability.** Recent months have seen multiple multi-hour incidents on `status.anthropic.com`. When Anthropic is down, several CMS features simply break — there is no fallback path.
2. **Cost vs. task complexity.** Many CMS calls are trivial (alt-text, slug suggestions, meta descriptions, simple HTML cleanups). Routing every one of these through Claude on the Max plan eats into the rate budget that should be reserved for harder tasks.

We need a second LLM provider that is (a) self-hosted and free at the margin, (b) good enough for simple text/code/HTML/CSS work, and (c) trivially callable from the CMS via an interface identical to our existing AI client.

## Solution

Stand up a small Dockerized service — internal name `whai-gateway` — that exposes a TypeScript HTTP API in front of a local Gemma 4 model served by Ollama. The CMS calls it through the existing `@webhouse/ai` package by adding a new `local` provider tier.

Phase 1 is purely about validating the setup locally:

- Run Gemma 4 **E4B** (effective 4B params, multimodal-in/text-out, Apache 2.0) under Ollama.
- Test on the Mac M1 (Docker Desktop) and the Ubuntu box.
- Build a minimal Next.js (App Router, server-side) TypeScript API wrapper with auth, streaming, and an OpenAI-compatible response shape.
- Benchmark quality on representative CMS prompts: alt-text, meta descriptions, slug generation, HTML cleanup, small CSS snippets, short blog intros.

Only after Phase 1 passes do we look at remote GPU hosting (Runpod / Scaleway / Hetzner) and at larger models (26B A4B).

## Technical Design

### 1. Model & runtime

- **Model:** `gemma4:e4b` via Ollama. ~4 GB on disk after Q4 quantization. Multimodal input (text + image), text output, ~256K context window, Apache 2.0 license.
- **Runtime:** Ollama. Gives us OpenAI-compatible `/v1/chat/completions` and `/v1/embeddings` endpoints out of the box, handles model download/quantization, and supports streaming.
- **Why not vLLM in Phase 1:** vLLM is faster at scale but requires CUDA and is non-trivial on M1. Ollama is the right tool for local validation. We can swap to vLLM in Phase 3 when we move to a real GPU.

### 2. M1 deployment note (important)

Docker Desktop on Apple Silicon **does not pass Metal/GPU through to Linux containers**. Running Ollama inside a container on M1 means CPU-only inference, which is slow even for E4B (expect ~5–15 tok/s).

We therefore use a **hybrid setup on M1**:

- **Ollama runs natively** on the Mac via `brew install ollama`, listening on `127.0.0.1:11434`. This uses Metal and gives ~40–80 tok/s for E4B.
- **Only the TS API runs in Docker Desktop** and reaches the host Ollama via `host.docker.internal:11434`.

On the Ubuntu box (NVIDIA GPU) we run **everything in Docker** with `--gpus all`, since the NVIDIA Container Toolkit gives proper GPU passthrough. This gives us a clean apples-to-apples comparison and validates that the Docker-only path will work on a remote GPU host later.

### 3. Repository layout

New repo: `webhousecode/whai-gateway` (private).

```
whai-gateway/
├── docker-compose.m1.yml       # API in Docker, Ollama on host
├── docker-compose.linux.yml    # Both in Docker, GPU passthrough
├── .env.example
├── api/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   └── app/
│       ├── api/
│       │   ├── health/route.ts
│       │   ├── chat/route.ts          # OpenAI-compatible passthrough
│       │   ├── generate/route.ts      # Simple prompt → text
│       │   └── embed/route.ts
│       └── lib/
│           ├── ollama.ts
│           ├── auth.ts
│           └── prompts.ts             # CMS task templates
└── bench/
    ├── prompts.json                   # ~30 representative CMS prompts
    └── run.ts                         # Quality + latency benchmark
```

Stack: Next.js 16.1.6+, React 19.2.4+, TypeScript, Tailwind v4 (only used by a tiny `/` status page), shadcn/ui v4. Server-side only — no client components beyond the status page. Auth via bearer token from `.env` (matches the `dns-api` / WHop pattern).

### 4. API surface

All endpoints require `Authorization: Bearer ${WHAI_API_KEY}`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + reports loaded model + Ollama status |
| `POST` | `/api/chat` | OpenAI-compatible `chat/completions` passthrough (streaming supported) |
| `POST` | `/api/generate` | Simplified `{ prompt, task?, maxTokens? }` → `{ text }` |
| `POST` | `/api/embed` | `{ input }` → `{ embedding }` (for future RAG use) |

The `task` field on `/api/generate` selects a curated system prompt from `lib/prompts.ts` (e.g. `alt_text`, `meta_description`, `slug`, `html_cleanup`, `css_snippet`, `blog_intro`). This is where we encode CMS-specific guardrails.

### 5. `@webhouse/ai` integration

Extend the existing model registry with a new tier:

```ts
// packages/ai/src/registry.ts
export const models = {
  fast:     { provider: 'anthropic', id: 'claude-haiku-4-5-20251001' },
  smart:    { provider: 'anthropic', id: 'claude-sonnet-4-6' },
  powerful: { provider: 'anthropic', id: 'claude-opus-4-6' },
  local:    { provider: 'whai',      id: 'gemma4:e4b' },  // NEW
  cheap:    { provider: 'whai',      id: 'gemma4:e4b' },  // re-aliased to local
};
```

A new `whai` provider in `@webhouse/ai` translates calls to the gateway. Because the gateway speaks OpenAI's chat-completions shape, this is a thin adapter on top of the AI SDK's `openai-compatible` provider.

### 6. Fallback policy

Add a `withFallback()` helper in `@webhouse/ai`:

```ts
const result = await withFallback(
  () => generate({ model: 'fast', prompt }),
  () => generate({ model: 'local', prompt }),
);
```

Triggers fallback on:
- HTTP 5xx from Anthropic
- Timeouts > 30s
- Anthropic SDK `overloaded_error` / `api_error`
- An explicit "circuit open" flag set by a poller that watches `status.anthropic.com`

The CMS opts in per call site; we do **not** make this global, because some calls (e.g. F111 long-form content) should fail loudly rather than silently degrade.

### 7. Benchmark harness

`bench/run.ts` runs ~30 representative CMS prompts against:
- `gemma4:e4b` (local)
- `claude-haiku-4-5` (baseline)

…and records latency, token counts, and a quality score. Quality scoring uses Claude as judge (1–5) — same pattern as CPM verify pipeline. Output: a markdown table committed to `bench/results/`.

This is how we decide whether E4B is good enough for each task type, or whether we need to escalate to 26B A4B on a remote GPU.

## Impact Analysis

**Positive**
- Anthropic outages stop breaking CMS AI features.
- Trivial generation tasks move off the Max-plan rate budget.
- Establishes a reusable local-LLM pattern for WHop, cronjobs and Senti projects.
- Validates the deployment path before we spend money on a remote GPU.

**Negative / risks**
- E4B quality may be insufficient for some tasks → mitigated by per-task benchmarking and selective fallback.
- Adds a new service to operate → mitigated by keeping it stateless and fly.io-deployable (Phase 4).
- Hybrid M1 setup is slightly unusual → documented clearly in the repo README.

**Out of scope for this feature**
- Image generation (FLUX/SDXL) and voice generation (XTTS) — these will be a separate F-numbered feature once text generation is validated.
- Embeddings-backed RAG over CMS content — `/api/embed` is exposed but unused by CMS in Phase 1.

## Implementation Steps

### Phase 1 — Local validation on M1 (target: ~1 day)

1. `brew install ollama && ollama pull gemma4:e4b`
2. Smoke-test: `ollama run gemma4:e4b "Write a short alt-text for a photo of a red bicycle leaning against a brick wall."`
3. Scaffold `whai-gateway` repo with Next.js 16 + TypeScript + shadcn/ui status page.
4. Implement `/api/health`, `/api/chat`, `/api/generate` with bearer auth from `.env`.
5. Write `docker-compose.m1.yml` (API only, points at `host.docker.internal:11434`).
6. Verify end-to-end via `curl`.

### Phase 2 — Ubuntu validation (target: ~0.5 day)

1. Install NVIDIA Container Toolkit on the Ubuntu box.
2. Write `docker-compose.linux.yml` with Ollama + API, both in Docker, `--gpus all`.
3. Pull `gemma4:e4b` inside the Ollama container.
4. Re-run smoke tests; confirm Docker-only path works.

### Phase 3 — Benchmark + CMS integration (target: ~1.5 days)

1. Build `bench/prompts.json` from real CMS task patterns (alt-text, meta, slugs, HTML cleanup, CSS snippets, blog intros).
2. Run `bench/run.ts` on M1 and Ubuntu; commit results.
3. Add `whai` provider + `local` tier to `@webhouse/ai`.
4. Add `withFallback()` helper.
5. Wire one low-risk CMS call site (e.g. alt-text suggestion) to use `local` directly.
6. Wire one critical call site (e.g. F111 draft generation) to use `withFallback(smart, local)`.

### Phase 4 — Remote GPU (separate feature, F113+)

Only after Phase 3 results are in:
- Pick provider (Runpod serverless for burst, Hetzner GEX44 for 24/7 EU).
- Containerized deployment of the same `whai-gateway` repo.
- Likely upgrade to `gemma4:26b-a4b` on the remote GPU.
- `@webhouse/ai` learns to prefer remote `local` when available, fall back to on-host local, then to Anthropic — or any ordering we like.

## Dependencies

- `@webhouse/ai` package (already exists; needs `whai` provider added)
- Ollama ≥ latest with Gemma 4 support
- Docker Desktop on M1; Docker + NVIDIA Container Toolkit on Ubuntu
- Bearer-token auth pattern from `webhousecode/dns-api`
- No new third-party paid services in Phase 1

## Open Questions

1. **Where does the gateway live in production?** Fly.io machine with persistent volume for the model, or remote GPU host directly running both Ollama and the API? Defer until Phase 4.
2. **Do we want per-task fine-tuning?** Gemma 4 is reportedly so strong out of the box that fine-tuning may be unnecessary. Decide after the benchmark.
3. **Streaming all the way to CMS UI?** CMS today uses non-streaming for most AI calls. Worth wiring SSE end-to-end now, or defer?
4. **Circuit breaker source of truth.** Poll `status.anthropic.com` page, watch SDK error rate, or both? Probably both with different thresholds.
5. **Should the gateway also proxy Anthropic itself**, so the CMS only talks to one endpoint and the gateway handles all fallback logic centrally? Tempting, but adds latency to the happy path.

## Effort Estimate

| Phase | Effort |
|---|---|
| Phase 1 — M1 local validation | ~1 day |
| Phase 2 — Ubuntu validation | ~0.5 day |
| Phase 3 — Benchmark + CMS integration | ~1.5 days |
| **Total for this feature (F112)** | **~3 days** |
| Phase 4 — Remote GPU deployment | separate feature, ~1–2 days |
