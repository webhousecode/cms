# F144 — Dynamic Site Build Orchestrator (cms-admin spawns ephemeral build machines)

**Status:** planned
**Owner:** cms-core
**Priority:** Tier 1 (unifies dynamic-site deploys under one UX, eliminerer "flyctl deploy fra terminalen")
**Estimat:** 4-6 fokuserede dage (forudsætter F143 er landed — F144 genbruger source-mgmt + dep-scan + install-queue)
**Created:** 2026-05-03
**Søsterplan:** F143 (Common Build Server for static) — F144 udvider samme primitiv til dynamiske sites med Docker-image som artifact

## Motivation

I dag for SSR sites (Next.js, Bun/Hono, etc.):

1. Du editor på din Mac, tester på localhost:3000
2. `git commit + push` til GitHub
3. `flyctl deploy` foran terminalen (eller `pnpm deploy` script)
4. Venter 5-10 min foran CI-output
5. Fly's egen builder bygger image, ruller den ud

For statiske sites bygger F143 dette ind i cms-admin's rocket-knap. **F144 gør det samme for dynamiske sites** så hele dit deploy-loop sker fra én knap i admin — uden at åbne terminal, uden at huske `flyctl deploy`-script.

## Vision

cms-admin er **ikke** en build server selv for tunge SSR builds — den **orkestrerer** ephemeral build-maskiner. Præcis det Vercel og Netlify gør internt: dashboard'et er lille, build-VM'en er stor og kortlivet.

```
cms-admin (lille, billig, altid kørende)
   │
   │ 1. Trigger detected (rocket / GHA / GH webhook)
   │ 2. Tar source (lokalt fra sites/<id>/source/ ELLER git pull fra GH)
   │ 3. Fly Machines API: spawn ephemeral builder (shared-cpu-4x, arn)
   │ 4. Builder: pnpm install + next build → producerer Docker image
   │ 5. Builder: push image til ghcr.io/webhousecode/<site-id>:<sha>
   │ 6. Builder dræber sig selv
   │ 7. cms-admin: flyctl deploy --image ghcr.io/.../<sha> mod target-app
   │    → rolling restart, zero-downtime
   │ 8. Smoke-test på den nye machine før traffic switches over
   │ 9. Done — Deploy-modal viser "Live"
```

## Scope

### IN-scope

1. **3 build-triggers** med fælles backend:
   - **Manual rocket** i cms-admin → pull fra GH (hvis source-URL configured) eller brug local source → build
   - **Site-repo's egen GHA** → POST `/api/admin/sites/<id>/rebuild` (auth via `wh_`-token) → build
   - **GitHub webhook** → cms-admin modtager `push` event → matcher mod registrerede sites → build
2. Fly Machines API integration: spawn `shared-cpu-4x@4096MB` builder i `arn` region
3. Source transport: tar fra cms-admin's `sites/<id>/source/` ELLER `git clone --depth=1` fra GH til builder
4. Builder Dockerfile generator: per-framework template (Next.js, Bun/Hono, Vite SPA, custom Dockerfile-i-repo)
5. Builder pusher resulterende image til ghcr.io/webhousecode/<site-id>:<sha>
6. cms-admin: `flyctl deploy --image <ghcr-url>` mod site's konfigurerede target-app
7. Smoke-test pipeline: HTTP probe mod ny machine før traffic-swap
8. Rollback: hold seneste 3 image tags i GHCR; "Rollback to <sha>" knap i UI swapper image back
9. Live build-log streaming fra ephemeral builder → Deploy-modal SSE
10. Site config: `buildHost: 'cms-admin' | 'fly-ephemeral' | 'github-actions' | 'host-native'` (default: `host-native` — backward-compat)
11. F143's `dep-scanner.ts` genbruges men identificerer også framework (Next.js, Bun, etc.) for at vælge rigtig Dockerfile-template

### OUT-of-scope

- Vercel deploy-orkestrering (Vercel har sit eget system; brug deres webhook-deploy hvis du vil hoste der)
- Multi-region deploys (vi deployer kun til `arn` for nu — andre regioner = senere F)
- Canary deploys / progressive rollouts (rolling restart med smoke-test er nok for nu)
- Kubernetes target (Fly Machines er vores primære host; K8s er en helt anden world)
- Database migration orchestration (sites kører deres egne migrations på startup; cms-admin rører ikke DB)

### Non-goals

- Erstatte Vercel/Netlify for sites der allerede er glade der
- Bygge en general-purpose CI/CD platform (vi gør én ting: build SSR site → deploy til Fly)
- Self-host builder på din Ubuntu maskine (du nævnte det som mulighed; F144 går efter Fly Machines som primary, Ubuntu kan være senere fallback)

## Arkitektur — 3 build-triggers, ét backend

### Trigger 1: Manual rocket i cms-admin (pull-driven)

```
User trykker rocket på "sanneandersen-site" i webhouse.app/admin
   │
   ├─ cms-admin tjekker site config:
   │     buildHost: 'fly-ephemeral'
   │     source: 'github:webhousecode/sanneandersen-site'
   │     branch: 'main'
   │
   ├─ Hvis source = 'github:...':
   │     Shallow clone seneste main → /tmp/cms-build/<uuid>/source
   │     ELLER hvis source = 'local': brug sites/<id>/source/
   │
   └─ Spawn builder (se "Builder maskinen" nedenfor)
```

Pros: explicit user control, virker uden at site-repo'en kender til cms-admin.
Når relevant: når du har pushet flere commits og kun vil deploye når DU siger til.

### Trigger 2: Site-repo's egen GHA (push-driven, opt-in)

Site-repo tilføjer en lille GHA:

```yaml
# .github/workflows/cms-rebuild.yml
on:
  push:
    branches: [main]
jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - name: Tell cms-admin to rebuild
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CMS_REBUILD_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"sha":"${{ github.sha }}","branch":"${{ github.ref_name }}"}' \
            https://webhouse.app/api/admin/sites/sanneandersen-site/rebuild
```

cms-admin's endpoint:
- Verificerer `wh_…` token (per-site permission for rebuild action)
- Læser sha fra body, bruger den som GHCR image tag
- Spawner builder (samme path som trigger 1)

Pros: build-logs synlige i GitHub Actions UI også, push-driven (ingen menneskelig action mellem code change og deploy).
Når relevant: når du vil have "git push = live om 5 min" oplevelsen.

### Trigger 3: GitHub webhook → cms-admin (push-driven, zero-touch)

Site-repo behøver INTET GHA. Bruger blot tilføjer en webhook i GitHub repo settings:

```
URL:        https://webhouse.app/api/admin/github/webhook
Content:    application/json
Secret:     <auto-generated per site, vises i cms-admin UI>
Events:     Just the push event
```

cms-admin's webhook endpoint:
- Verificerer HMAC signature (mod per-site secret)
- Parser `repository.full_name` + `ref` + `head_commit.id`
- Matcher mod registrerede sites (lookup på source: `github:owner/repo`)
- Hvis match + `ref == site.branch`: spawner builder

Pros: site-repo har INGEN viden om cms-admin. Bare en webhook i GH UI. Renere end trigger 2.
Når relevant: når du vil have push-driven uden at røre site-repo'ens .github/workflows/.

### Builder maskinen (fælles backend for alle 3 triggers)

```
1. cms-admin tar source-træ (eksklusive node_modules, .next, .git)
   → /tmp/source-<uuid>.tar.gz på cms-admin's disk

2. cms-admin generer Dockerfile baseret på framework-detect:
   - next.config.* findes? → Next.js standalone Dockerfile-template
   - bun.lockb findes? → Bun + Hono Dockerfile-template
   - vite.config.* findes + ingen SSR? → Vite SPA (kategoriseres som static, hører hjemme i F143)
   - Dockerfile findes i repo? → brug den (custom override)

3. Fly Machines API: POST /v1/apps/<cms-admin-app>/machines
   {
     "name": "build-<site-id>-<sha>",
     "region": "arn",
     "config": {
       "image": "ghcr.io/webhousecode/cms-builder:latest",
       "guest": { "cpu_kind": "shared", "cpus": 4, "memory_mb": 4096 },
       "auto_destroy": true,
       "env": {
         "SITE_ID": "...",
         "SHA": "...",
         "TARGET_APP": "...",
         "REGISTRY_TOKEN": "<scoped GHCR push token>"
       },
       "files": [
         { "path": "/build/source.tar.gz", "raw_value": "<base64 tar>" },
         { "path": "/build/Dockerfile", "raw_value": "<dockerfile>" }
       ]
     }
   }

4. Builder maskinens entrypoint kører:
   set -e
   cd /build
   tar xzf source.tar.gz
   docker build -f Dockerfile -t ghcr.io/webhousecode/<SITE_ID>:<SHA> .
   docker push ghcr.io/webhousecode/<SITE_ID>:<SHA>
   curl -X POST cms-admin's callback URL --data '{"sha":"<SHA>","status":"success"}'
   # auto_destroy=true → maskinen dræber sig selv her

5. cms-admin modtager success callback:
   - flyctl deploy --image ghcr.io/webhousecode/<SITE_ID>:<SHA> --app <TARGET_APP>
   - Dette triggerer rolling restart i Fly: ny machine startes, health-check, traffic switches over, gammel machine destroyes
   - cms-admin poll'er Fly's deployment status indtil "successful" eller "failed"

6. Smoke-test pipeline:
   - Health-check: GET https://<TARGET_APP>.fly.dev/api/health → 200 expected
   - Hvis fejler: cms-admin trigger rollback → flyctl deploy --image <forrige-sha>
   - UI viser: "Deploy succeeded but smoke-test failed → rolled back to <forrige-sha>"

7. Live log streaming:
   - Builder maskinen logger til stdout
   - cms-admin SSE-streamer Fly Machines logs API output → Deploy-modal i UI
   - User ser real-time hvad builder gør (pnpm install progress, next build output, docker push progress)
```

### Per-framework Dockerfile templates

cms-admin shipper et lille bibliotek af Dockerfile-templates i `packages/cms-admin/templates/builders/`:

- `nextjs.Dockerfile` — Node 22, pnpm, copy source, pnpm install, next build (output=standalone), runner stage med node server.js
- `bun-hono.Dockerfile` — oven/bun:latest, bun install, bun build, runner med bun start
- `vite-spa.Dockerfile` — kun til SPA (no SSR); resulterende dist/ pushes til static host i stedet (men hvis site har SSR delene = full vite-ssr template)
- `custom` — site-repo har sin egen Dockerfile, vi respekterer den (override-path)

Site config kan override:
```ts
build: {
  buildHost: 'fly-ephemeral',
  framework: 'nextjs',  // explicit; eller udeladt for auto-detect
  dockerfile: './custom-Dockerfile',  // override
}
```

### Costs

`shared-cpu-4x@4096MB` på Fly: $0.0000311/sec → $0.11/time.

| Build-tid | Cost pr deploy |
|---|---|
| 2 min (lille app) | $0.0037 |
| 5 min (Next.js standard) | $0.009 |
| 10 min (Next.js stort med 100+ pages) | $0.018 |

100 deploys/måned ≈ $1. **Trivielt.** Ingen grund til at optimere mod GHA's gratis runners før vi runder $50/måned.

### Storage budget

| Component | Storage |
|---|---|
| Ephemeral builder VM disk | 10-20 GB i 5-10 min, derefter $0 (auto-destroy) |
| GHCR image tag (per build) | 100-500 MB pr build, ~3 keep'es per site (rolling), eldste slettes via F143's ghcr-cleanup workflow |
| cms-admin's volumen | uændret (bygger ikke selv) |

## Sammenligning med eksisterende paths

| Path i dag | F144 path |
|---|---|
| `flyctl deploy` foran terminalen | Rocket-knap i admin |
| GitHub Actions workflow_dispatch | GH webhook eller GHA → cms-admin API |
| Vercel "deploy on push" | Identisk UX, self-hosted |
| Netlify build | Identisk UX, self-hosted |
| Fly's egen builder (`flyctl deploy --remote-only`) | Stadig brugbar — F144 er en alternativ path, ikke en forced replacement |

## Dependencies på andre F-features

- **F143 (Common Build Server)**: F144 GENBRUGER F143's source-mgmt, install-queue, dep-scanner. F144 bygger ikke fra scratch.
- **F134 (Access Tokens)**: rebuild API endpoint (trigger 2) auth'er via `wh_`-tokens.
- **F12 (Deploy)**: F144 udvider Deploy-modal med builder-stage tracking + rollback knap.
- **F126 (Custom build commands)**: respekteres ovenpå — hvis cms.config.ts har `build.command: 'pnpm custom-build'` bruger builder den i stedet for default `pnpm build`.

## Rollout — 5 phases

### Phase 1 — Builder VM image (1 dag)
- Byg `ghcr.io/webhousecode/cms-builder:latest` (Alpine + Node 22 + pnpm + Bun + docker CLI + entrypoint script)
- Push til GHCR (én gang, opdateres når base tools skal upgraderes)
- Tests: kør lokalt med `docker run` mod en sample Next.js source-tar — verificér image bygges + pushes til GHCR

### Phase 2 — Fly Machines API integration (1 dag)
- Implement `packages/cms-admin/src/lib/build-orchestrator/fly-machines.ts`:
  - `spawnBuilder(siteId, sha, sourceTar): Promise<MachineId>`
  - `streamBuilderLogs(machineId, onLine: (line: string) => void)`
  - `awaitBuilderCompletion(machineId): Promise<{success, imageTag, error?}>`
- Tests: spawn en mock-builder på Fly, verificér log-stream + completion callback virker

### Phase 3 — Manual rocket trigger (trigger 1) (1 dag)
- Site config: `buildHost`, `source`, `branch`, `targetApp` fields
- Implement source-fetch: `git clone --depth=1` hvis source = `github:...`, ellers tar fra `sites/<id>/source/`
- Implement framework auto-detect: tjek for `next.config.*`, `bun.lockb`, etc.
- Hook ind i Deploy-modal: når buildHost=`fly-ephemeral`, brug F144 path
- Tests: deploy en eksisterende Next.js site (sanneandersen-site) gennem F144 path; sammenlign med traditional flyctl deploy

### Phase 4 — Push-driven triggers (trigger 2 + 3) (1.5 dag)
- Implement `POST /api/admin/sites/<id>/rebuild` (trigger 2): auth via `wh_`-token, accept `{sha, branch}` body, spawn builder
- Implement `POST /api/admin/github/webhook` (trigger 3): HMAC signature verification, parse push event, lookup site by source-URL match, spawn builder
- UI: Site Settings → Build → "Webhook URL" + "Secret" displayed for trigger 3 setup; "Rebuild Token" generator for trigger 2
- Tests: simuler GH webhook payload + curl POST mod rebuild API, verificér build kører end-to-end

### Phase 5 — Rollback + smoke-test + UI polish (1 dag)
- Smoke-test pipeline: HTTP health-check mod ny machine før traffic-swap
- Auto-rollback ved smoke-test failure: flyctl deploy --image <forrige-sha>
- UI: rollback button viser seneste 3 SHAs med deploy-tidspunkt + "Rollback" knap
- UI: real-time builder log stream i Deploy-modal (genbruger F143's SSE infrastructure)
- Documentation: AI Builder Guide + bilingual docs page om F144

## Acceptance criteria

1. **Trigger 1 (manual)**: rocket på sanneandersen-site i webhouse.app/admin spawner Fly builder, builder pusher image til GHCR, cms-admin deployer image til target-app, smoke-test passes, traffic swap'er over — alt synligt i Deploy-modal med live logs
2. **Trigger 2 (GHA)**: site-repo's `cms-rebuild.yml` pusher → cms-admin modtager + bygger + deployer; build-logs synlige BÅDE i GHA UI og Deploy-modal
3. **Trigger 3 (webhook)**: GH push event → cms-admin webhook endpoint → samme build flow; site-repo behøver INGEN GHA-fil
4. **Rollback**: smoke-test fejler → cms-admin auto-rollbacks til seneste good SHA; UI viser tydelig fejl-årsag
5. **Manual rollback**: bruger kan vælge en gammel SHA fra Deploy History UI og rollback dertil
6. **Build cost**: en typisk Next.js deploy koster <$0.02 (verificeret via Fly billing dashboard)
7. **Build-tid**: en typisk Next.js deploy fra rocket-tryk til "Live" tager <8 min wall-time
8. **Backward-compat**: sites der ikke har migreret til `buildHost: 'fly-ephemeral'` virker uændret — de fortsætter med deres eksisterende deploy-path

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| Fly Machines API rate-limits eller går ned | Lav | Retry med exponential backoff; queue builds hvis API er nede; bruger ser klart "Fly API unavailable, queued for retry" |
| Builder VM hænger uden at progress'e | Mellem | Hard timeout (30 min default); machine destroyes; build markeres som failed med log-snapshot |
| GHCR push fejler (kvota / auth / network) | Lav | Retry; clear error i UI; build-cache reuse hvis source er identisk |
| Smoke-test false-positive (passer trods broken site) | Mellem | Health-check skal hits flere endpoints (/api/health + 1-2 page-renders); bruger kan customize health-check URLs |
| Rolling restart bryder open WebSocket connections | Mellem | Fly's rolling restart venter på connection drain; for sites med kritiske WS, anbefal `auto_destroy=false` med manual confirm |
| Multi-tenant builder VM lækker secrets mellem sites | Lav (hver build har sin egen VM) | Builder env vars indeholder kun det specifikke site's tokens; auto-destroy efter build = ingen state mellem builds |
| Webhook secret leaks → angriber kan trigge rebuilds | Mellem | Per-site secret (ikke fælles); rebuild trigger BUILDER ikke arbitrary code execution; rate-limit pr endpoint (max 10 builds/time pr site) |
| Source pull fra GH bruger gammelt cached commit | Lav | `git clone --depth=1` er fresh hver gang; ingen cache mellem builds |
| Builder cost løber løbsk hvis loop-trigger | Mellem | Rate-limit: max 1 concurrent build pr site, max 20 builds/time pr site (config'erbart); cooldown ved gentagne fejl |

## Hvorfor F144 nu

webhouse-app, sanneandersen-site, fysiodk-aalborg-sport, og kommende kunde-sites er ALLE Next.js SSR. Hver gang nogen vil deploye åbner de terminalen og kører `flyctl deploy`. Det er præcis den friktion CMS'et burde fjerne — i stedet er CMS'et i dag bare content-editoren, og deploys er en helt separat workflow.

F144 unifies dem: ÉN knap i admin, samme UX som static sites (F143), live logs i samme modal, samme rollback-mønster. Det er der CMS'et går fra "værktøj jeg bruger til content" til "deploy-platformen jeg bygger min infrastruktur på".

## Relateret

- **F142** (Templated SSG) — alternativ til build.ts for static sites; orthogonalt til F144
- **F143** (Common Build Server for static) — søsterplan; F144 bygger ovenpå dens primitiv
- **F12** (Deploy) — F144 udvider eksisterende Deploy-modal og deploy-history
- **F126** (Custom build commands) — respekteres af F144's builder-template-system
- **2026-05-02 incident**: trail-landing 5-time Beam-saga gjorde det klart at cms-admin's deploy-rolle ikke kan være "vent på den rigtige terminal" — F144 generaliserer den lære til SSR
