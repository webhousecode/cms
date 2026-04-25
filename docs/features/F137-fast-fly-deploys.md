# F137 — Fast Fly Deploys (Build Cache + Iteration Speed)

**Status:** Draft
**Requested:** 2026-04-25 by Christian (during M1 webhouse.app go-live)
**Effort estimate:** 4–8 hours
**Tier:** 1 — Critical infra (blocks M1+ iteration speed)

---

## Problem

First post-M1 deploy of `webhouse-app` to Fly.io took **20+ minutes** because `fly deploy --remote-only` spawns a fresh builder VM with **no layer cache**. Every deploy re-runs:

- `pnpm install` from zero (3 GB+ store, 8 workspace packages)
- `pnpm build` for `@webhouse/cms`, `@webhouse/cms-ai`, `@webhouse/cms-mcp-{client,server}`, `@webhouse/cms-admin`
- Next.js production build with Turbopack
- Cross-arch packaging into the runtime image

For a CMS server we will iterate on multiple times per day, **20 min per deploy is unacceptable**. Even steady-state with current setup is ~5–8 min, still too slow for a "ship one small fix" workflow.

**Christian's exact wording (2026-04-25):**
> Så vil de sige at for hver gang vi vil push en enkelt lille forbedring til CMS server på webhouse.app så tager det 20 minutter? Det er IKKE acceptabelt …

---

## Vision

A small code change (one file edit, no dependency changes) deploys to webhouse.app in **< 90 seconds**.

| Scenario | Today | Goal |
|---|---|---|
| Cold deploy (fresh builder, no cache) | 20+ min | 5 min |
| Hot deploy (deps unchanged, code change only) | 5–8 min | 60–90 sek |
| CI deploy from main push | n/a | 2–4 min steady-state |

The user should never have to think "is this worth 20 minutes" before pushing a fix.

---

## Non-goals

- **NOT** moving away from Fly.io (volume + EU region + simple ops are right).
- **NOT** building our own image registry / build farm.
- **NOT** introducing a new CI provider (GitHub Actions stays).
- **NOT** changing the Dockerfile's runtime stage — only the build stages get cache plumbing. Runtime image semantics (volume, env, port, standalone server) stay identical.
- Local dev workflow stays untouched — F137 is pure prod-deploy plumbing.

---

## Why deploys are slow today (root causes)

Verified during M1 deploy on 2026-04-25:

1. **No BuildKit cache mounts in Dockerfile.** `RUN pnpm install --frozen-lockfile` writes to `/root/.local/share/pnpm/store`, which is discarded with the build layer. Each builder VM downloads every package from npm again. Roughly 3 min of the 20 min.
2. **No persistent layer cache between builds.** Fly's remote builder is ephemeral; without `[build] image_repo` in `fly.toml`, layers are not pushed to a registry that the next build can pull from. Cold start every time.
3. **Build-context push is large.** The repo + `.next` cache + `node_modules` (if not in `.dockerignore`) get tarred and uploaded to the builder. ~30–60 sek of pure transfer per deploy.
4. **`pnpm build` runs all five workspace packages serially.** Even with no source changes in `cms-ai` and `cms-mcp-*`, they rebuild because `tsup` doesn't know they're already built. ~2 min wasted on unchanged packages.
5. **`fly deploy --remote-only` waits for full image push to Fly registry before triggering machine update.** Reasonable, but combined with the above this is the long-tail.

---

## Architecture / scope

Three independent improvements, each landed separately so we can measure deltas:

### Phase A — BuildKit cache mounts in Dockerfile (~30 min, biggest single win)

Convert `RUN pnpm install` to use BuildKit cache mounts:

```dockerfile
# syntax=docker/dockerfile:1.7
# ── deps stage ─────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* .pnpmfile.cjs pnpm-approve-builds.json tsconfig.base.json ./
COPY packages/*/package.json ./packages/
COPY examples/blog/package.json examples/landing/package.json ./examples/

# Cache mount — pnpm store survives between builds on the same builder
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
```

Also add cache mount for `pnpm build` so `tsup` and `next` keep their incremental caches:

```dockerfile
RUN --mount=type=cache,id=cms-next-cache,target=/app/packages/cms-admin/.next/cache \
    --mount=type=cache,id=cms-tsup-cache,target=/app/packages/cms/.tsup-cache \
    pnpm --filter @webhouse/cms build && \
    pnpm --filter @webhouse/cms-ai build && \
    pnpm --filter @webhouse/cms-mcp-client build && \
    pnpm --filter @webhouse/cms-mcp-server build && \
    pnpm --filter @webhouse/cms-admin build
```

**Expected effect:** `pnpm install` drops from ~3 min to ~10 sek on warm builder. `pnpm build` drops from ~6 min to ~1.5 min when only cms-admin source changed.

### Phase B — Persistent registry-cache tag (~15 min)

Tell Fly to push every build's layers to a registry tag the next build can pull from:

```toml
# fly.toml
[build]
  dockerfile = "deploy/webhouse-app/Dockerfile"
  image = "registry.fly.io/webhouse-app:cache"  # <- new
```

And in `Dockerfile`, at the top of each long stage:

```dockerfile
FROM node:22-alpine AS deps
# ... (cache hits via the image= tag above)
```

This means a build VM that's never seen this app before still pulls cached layers from the registry — covers the "fresh builder VM" case. Combined with Phase A: **cold deploy 20 min → 5 min**.

### Phase C — `.dockerignore` cleanup + minimal context (~10 min)

Audit `.dockerignore` to ensure we don't tar `node_modules`, `.next`, `.turbo`, `.cache`, `coverage`, `test-results`, `playwright-report`, `.git`, `docs/`, `examples/static/*/dist/`, etc. into the build context. Goal: < 50 MB context push instead of multi-GB.

```
node_modules
**/node_modules
.next
**/.next
.turbo
coverage
test-results
playwright-report
*.log
.git
docs
examples/static/*/dist
examples/static/*/_data
examples/blog/.next
.claude
.env*
```

**Expected effect:** Context push drops from ~60 sek to ~5 sek.

### Phase D (stretch) — GitHub Actions buildx cache (~1–2 hours)

Move the actual build out of the developer's terminal and onto GitHub Actions, with `docker/build-push-action` + `cache-to: gha,mode=max` + `cache-from: gha`. After Phase A+B+C, this is gravy — but it means the developer's Mac doesn't block on the build at all. Push to main → GH Actions builds (cached, 2 min) → pushes to Fly registry → `fly deploy --image <tag>` → machine swap.

```yaml
# .github/workflows/deploy.yml (excerpt)
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v5
  with:
    context: .
    file: deploy/webhouse-app/Dockerfile
    push: true
    tags: registry.fly.io/webhouse-app:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
- run: flyctl deploy --image registry.fly.io/webhouse-app:${{ github.sha }}
```

Phase D is OPTIONAL — Phase A+B alone should hit the < 90 sek hot-deploy target.

---

## Verification

We must measure, not guess. After each phase land:

1. **Touch one file** (`echo "// poke" >> packages/cms-admin/src/app/admin/page.tsx`)
2. **Time `fly deploy --remote-only`** end-to-end with `time`
3. **Record in this doc:**
   - Phase 0 (current): ___ min ___ sek
   - Phase A only: ___ min ___ sek
   - Phase A + B: ___ min ___ sek
   - Phase A + B + C: ___ min ___ sek
   - Phase A + B + C + D (CI deploy): ___ min ___ sek

Acceptance criteria: hot deploy `< 90 sek` consistently.

---

## Risks / rollout

- **BuildKit cache mounts require Docker BuildKit (not legacy builder).** Fly's remote builder uses BuildKit by default since 2023, so should work. If it doesn't, fall back to plain `RUN` and rely on Phase B + C only.
- **`image = "registry.fly.io/<app>:cache"`** writes to the same registry the runtime image uses. Tag must be distinct (`:cache` vs `:deployment-...`) to avoid clashing with runtime image rotation.
- **Cache poisoning:** if a stale cache layer ever causes "works locally, broken on Fly" we add `--no-cache` to the deploy command for a manual flush. Document this in the deploy runbook.
- **No runtime impact.** All phases only affect the build stages. Runtime container, env vars, volume mounts, and port handling stay identical to M1 state.

---

## Order of work

Land phases as separate commits so each one's effect is measurable:

1. **F137-A**: BuildKit cache mounts in `deploy/webhouse-app/Dockerfile`. Deploy + measure.
2. **F137-B**: `[build] image = "registry.fly.io/webhouse-app:cache"` in `fly.toml`. Deploy + measure.
3. **F137-C**: `.dockerignore` cleanup. Deploy + measure.
4. **F137-D (stretch)**: GH Actions buildx-cache deploy.yml rewrite. Optional if A+B+C hit target.

Each phase has its own commit message `feat(F137-X): <phase>`.

---

## Open questions

None — implementation is straightforward Docker/Fly plumbing. Success criterion (hot deploy < 90 sek) is the only thing to verify.
