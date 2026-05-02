# F143 — Common Build Server (cms-admin native build host)

**Status:** planned
**Owner:** cms-core
**Priority:** Tier 1 (unblocks "filesystem sites publish from anywhere" — short-term path)
**Estimat:** 3-5 fokuserede dage
**Created:** 2026-05-02
**Søsterplan:** F142 (Templated SSG) — F143 er den pragmatiske near-term sti, F142 er langsigtsdrømmen. De koeksisterer.

## Motivation

Audit af 20 build.ts filer (2026-05-02): **11/20 har 0 npm-deps, 5/20 har kun `marked`, 0/20 har "tunge" deps**. Med andre ord: build.ts'erne ER små og statiske, men hver har sit eget `node_modules` der kun indeholder marked + tsx. Det er **enorm overhead for trivial gevinst**.

**Det observerede problem:**
- Filesystem-sites kan ikke deployes fra remote cms-admin (webhouse.app) fordi build.ts + per-site node_modules mangler. Beam transporterer kun content. Kostede 5 timer på trail-landing 2026-05-02.
- Hver gang en site ændrer build.ts dependencies (sjældent — men det sker), skal det re-installeres på hver cms-admin host.

**F143's tese:** vi behøver ikke slette build.ts (det gør F142). Vi flytter bare BUILD-EXECUTION ind i cms-admin's egen Node-proces, hvor en delt pulje af de mest brugte deps allerede er installeret. Sites' build.ts importerer bare fra den fælles pulje.

## Vision

cms-admin har en **indbygget build server-modul** med:

1. **En forhåndsinstalleret core pulje af deps** (marked, gray-matter, slugify, sharp, marked-highlight, ~5 stk) — dækker 99% af eksisterende build.ts
2. **Runtime-add-on installation** for sites der har specifikke ekstra behov, declared i `cms.config.ts`'s `build.deps` field. cms-admin pnpm-installer disse on-demand i en delt content-addressable store
3. **build.ts kører i cms-admin's Node-proces** (child_process for isolation) — ingen per-site `node_modules`, ingen per-site `tsx` install
4. **Beam transporterer KUN det der ikke kan udtrykkes i cms.config:** content + build.ts + (optional) public/ assets. Aldrig node_modules.

Resultatet: site-konfigurationen forbliver **build.ts** (kendt kontrakt, ingen ny DSL at lære), men **build-executionen** flytter til cms-admin (én delt installation, virker overalt).

## Scope

### IN-scope

1. Pre-installerede core deps i `packages/cms-admin/package.json`: marked, gray-matter, slugify, sharp, marked-highlight
2. Module resolution shim: når build.ts importerer en core dep, resolves den til cms-admin's egen kopi (ingen lokal `node_modules` krævet i site-mappen)
3. `cms.config.ts.build.deps?: string[]` field for sites der har brug for ekstra deps
4. On-demand install: cms-admin pnpm-installer ekstra deps i `/var/cms-admin/build-deps/<sha>/` (content-addressable, delt på tværs af sites med samme dep-set)
5. `build.ts` runner: spawner child_process der kører `tsx build.ts` med `NODE_PATH` peget på cms-admin's deps + site's evt. extra deps
6. Beam-fix: transporterer build.ts + cms.config.ts + content + public/ — **aldrig** node_modules
7. Rocket-knappen virker fra enhver cms-admin instance (lokal eller webhouse.app)
8. Live build-log streamet til Deploy-modal (samme child_process stdout/stderr capture som i dag)

### OUT-of-scope

- Templated SSG (det er F142)
- Erstattet build.ts med deklarativ config (F142)
- Sandboxing/security isolation ud over child_process + non-root user (kan komme senere hvis vi hoster 3rd-party sites)
- Live-reload på filesystem-changes (lige nu er deploy en eksplicit user-action; det forbliver det)
- Næste-gen package manager (vi bruger pnpm — content-addressable storage er allerede built-in)

### Non-goals

- Lade sites bringe ENHVER dep — dep-listen i cms.config skal godkendes/reviewes (voksende dep-pulje er en gæld)
- Erstattet GitHub Actions for sites der har genuinely complex CI (multi-step pipelines, secrets, parallel test matrices) — de blev aldrig kandidater til static-site SSG

## Arkitektur

### Komponenter

```
packages/cms-admin/
├── package.json              ← deklarerer core deps (marked, sharp, ...)
├── src/lib/build-server/
│   ├── runtime.ts            ← spawn child_process for build.ts
│   ├── dep-resolver.ts       ← computes NODE_PATH for build.ts run
│   ├── extra-deps.ts         ← on-demand pnpm install for cms.config.build.deps
│   └── log-streamer.ts       ← pipe stdout/stderr → Deploy-modal SSE
└── /var/cms-admin/build-deps/
    └── <hash-of-deps>/
        └── node_modules/     ← installed once, reused on tværs af sites
```

### Build trigger flow (efter F143)

```
User trykker rocket på site X
  │
  ├─ Læs cms.config.ts → build.deps?
  │
  ├─ Compute combined NODE_PATH:
  │     1. cms-admin's egen node_modules (core deps)
  │     2. /var/cms-admin/build-deps/<hash>/node_modules (hvis extra deps)
  │
  ├─ Hvis hash mangler: pnpm install --prefix /var/cms-admin/build-deps/<hash>
  │     pnpm content-addressable store: dep findes nok globalt → snapshot er ms-hurtig
  │
  ├─ Spawn child_process: NODE_PATH=<combined> npx tsx <projectDir>/build.ts
  │     stdout/stderr piped → Deploy-modal SSE
  │
  └─ Output i deploy/ → push til host (gh-pages / CF Pages / Fly static)
```

### Module resolution — hvordan build.ts ser de delte deps

build.ts skriver `import { marked } from 'marked';` som i dag. Resolution:

1. Node tjekker `<projectDir>/node_modules/marked` — **findes ikke** (vi shipper aldrig per-site node_modules)
2. Node tjekker forældrenes `node_modules` — derfor bruger vi `NODE_PATH` env var:
   ```
   NODE_PATH=/path/to/cms-admin/node_modules:/var/cms-admin/build-deps/<hash>/node_modules
   ```
3. Node finder marked i cms-admin's egen kopi → import fungerer som forventet

Dette er Nodes officielle multi-resolution mekanisme; ingen monkey-patching, ingen custom loader.

### `cms.config.ts.build.deps` — declared extra dependencies

```ts
// cms.config.ts
export default {
  collections: [...],
  build: {
    // Standard core-deps er altid tilgængelige (marked, gray-matter, slugify, sharp, marked-highlight)
    // Listen nedenfor er KUN extras specifikke for dette site:
    deps: ['three', 'd3-force'], // for et site med interactive Three.js + D3 visualisering
  },
};
```

cms-admin på første rocket-deploy:
1. Computes `hash = sha256(['three@latest', 'd3-force@latest'].sort().join())`
2. Tjekker `/var/cms-admin/build-deps/<hash>/`
3. Hvis ikke findes: `pnpm install --prefix /var/cms-admin/build-deps/<hash> three d3-force`
4. Adder til NODE_PATH
5. Build kører

Andet site med præcis samme `build.deps` array hitter samme hash → bruger den eksisterende installation. **Intet duplikeret arbejde.**

### Storage budget

| Komponent | Engangsstørrelse | Per site |
|---|---|---|
| cms-admin's core deps | ~30 MB (incl. sharp's binaries) | 0 |
| Extra-deps store på Fly volumen | varierer | 0 hvis sitet bruger kun core; ellers delt med andre sites med samme deps |
| Per-site node_modules | **0** | **0** |

Sammenligning: nuværende model med 30 sites × 50 MB = 1.5 GB. F143 model: 30 MB total + ~50 MB extra-deps store hvis 5 sites har eksotiske deps. **97% reduktion.**

### Beam-fix

Beam's source-list (det der bestemmer hvilke filer der transporteres ved import) udvides til at inkludere:
- `build.ts` (eller `build/` mappe hvis sitet har splittet det)
- `cms.config.ts`
- `content/` (allerede inkluderet)
- `public/` (allerede inkluderet)
- `tsconfig.json` hvis findes

Eksplicit EKSKLUDERET (gammel + ny):
- `node_modules/`
- `.next/`, `dist/`, `deploy/`
- `.git/`

Det giver en ren snapshot-størrelse på typisk <500 KB per site (uden uploads).

### Concurrent builds

Build-server modul har en **build-queue** med config-styret max concurrent (default 2):

```ts
// .env eller cms-admin config
CMS_BUILD_MAX_CONCURRENT=2
```

Sikrer at vi ikke crasher Fly-maskinen hvis 5 admins trykker rocket samtidig.

### Live build logs i Deploy-modal

cms-admin har allerede SSE-baseret deploy-status streaming (Deploy-modal viser "Initializing → Building & optimizing → Pushing → Live"). F143 udvider det med en **detail-section** der viser child_process stdout/stderr i real-time, så user kan se hvor build.ts står.

Brugere får samme debug-erfaring som hvis de havde kørt `npx tsx build.ts` lokalt — bare set fra Deploy-modal i UI.

## Sammenligning med F142

| | F143 (Common Build Server) | F142 (Templated SSG) |
|---|---|---|
| build.ts kontrakt | **bevares** | erstattes af templates/ |
| Per-site node_modules | 0 | 0 |
| New DSL at lære | nej | ja (tagged template literals) |
| Migration-arbejde pr site | 0 (re-Beam med ny source-list) | ~half day pr site (build.ts → templates/) |
| AI/dev kreativ frihed | fuld (skriv enhver build.ts) | begrænset til template helpers |
| "Eksotisk site" support | trivielt (bare deklarér deps) | kræver build.ts escape hatch |
| Phase 1 unblock-tid | **3-5 dage** | 7-10 dage |

**F143 er den pragmatiske quick-path; F142 er den ambitiøse strategiske path.** De udelukker ikke hinanden — F143 leverer "filesystem-sites virker fra remote" hurtigt, F142 reducerer ALL build.ts kompleksitet over tid.

## Dependencies på andre F-features

- **F126 (custom build commands)**: F143 er en udvidelse — `build.ts` runner integreres med F126's eksisterende switch-statement i `runSiteBuild`
- **F89 (post-build enrichment)**: uændret — kører post-build som i dag
- **F44 (media processing)**: deler `sharp` instans med build-server's core-deps pulje

## Rollout — 4 phases

### Phase 1 — Foundation (1 dag)
- Add core-deps til cms-admin/package.json: marked, gray-matter, slugify, sharp, marked-highlight
- Implement `dep-resolver.ts`: compute NODE_PATH for given build
- Implement `runtime.ts`: spawn child_process med NODE_PATH set
- Test: kør en eksisterende site's build.ts gennem den nye runner, verificér identisk output

### Phase 2 — Beam-fix (0.5 dag)
- Udvid Beam's source-list til at inkludere build.ts + cms.config.ts + tsconfig.json + public/ (eksklusive node_modules, .next, dist, deploy)
- Tests: re-Beam trail-landing, verificér at /data/cms-admin/beam-sites/trail/ får alt det nødvendige UNDTAGEN node_modules

### Phase 3 — Extra-deps system (1.5 dag)
- Implement `cms.config.ts.build.deps` parsing
- Implement `/var/cms-admin/build-deps/<hash>/` content-addressable store
- Implement on-demand `pnpm install` ved første brug af et nyt deps-set
- Tests: site med extra deps deployer succesfuldt fra både lokal og webhouse.app

### Phase 4 — Pilot + cleanup (1-2 dage)
- Pilot: trail-landing — slet `apps/landing/node_modules` og `package-lock.json`, behold build.ts. Re-Beam. Verificér rocket fra webhouse.app virker.
- Update Beam UI: vis explicit at "build environment provided by cms-admin" (no per-site install needed)
- Document i AI Builder Guide og README

## Acceptance criteria

1. `/data/cms-admin/beam-sites/trail/` har **ingen `node_modules`**
2. Trail-landing's rocket-knap fra webhouse.app's admin succesfuldt bygger og pusher til gh-pages
3. Build-output identisk til hvad localhost producerer (HTML diff = 0 bytes)
4. Build-tid <5 sec for trail-landing (samme som lokalt)
5. Site med `build.deps: ['three']` declared deployer succesfuldt; second site med samme deps genbruger installation (no re-install)
6. Concurrent rocket-trigger på 2 sites blokkerer ikke hinanden (queue fungerer)

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| sharp's native binaries differerer mellem lokal Mac og Fly Linux | Mellem | sharp shipper alle platform-binaries; cms-admin's package.json pin'er sharp-version, alle hosts er Linux container i prod |
| extra-deps install hænger / fejler første gang | Lav-mellem | Timeout + retry + clear error i Deploy-modal |
| pnpm content-store fylder volumen op | Lav | Cleanup job: slet build-deps directories der ikke har været tilgået i 30 dage |
| build.ts skriver til steder uden for projectDir | Lav | child_process kører som non-root user med begrænset write-access (kun til projectDir/deploy/) |
| Multi-tenant: site A's build kan se site B's secrets | Mellem | child_process env-vars renses per spawn; kun site-relevante secrets passes ind |

## Relateret incident

2026-05-02: trail-landing publish failed på webhouse.app med "No build.ts found". Hot-fix var at sftp build.ts + node_modules op til Fly volumen — engangsarbejde der vil decay'e ved næste build.ts-ændring. **F143 er den varige løsning der gør hot-fixet permanent unødvendigt.**

## Hvorfor begge F142 og F143

F143 leverer **kontrakt-bevaring** og **hurtig fix**: alle eksisterende sites virker dag 1, ingen migration nødvendig. cms-admin bliver det centrale build-host som var den oprindelige intention med rocket-knappen.

F142 leverer **kreativ-friktion-eliminering**: AI/dev sessioner skriver mindre kode, designe ændringer er deklarative, sites har ingen build.ts overhovedet at vedligeholde.

Anbefalet rækkefølge: **F143 først (3-5 dage), så F142 når der er tid (7-10 dage)**. F143 unblokker det akutte problem (rocket fra webhouse.app virker for filesystem-sites), F142 reducerer langtidsgælden.

## Referencer

- F142 — Templated SSG Runtime (komplementær søsterplan)
- F126 — Custom build commands (eksisterende escape hatch)
- Hard rule i `cms/CLAUDE.md`: "Live sites are authored + deployed from a remote CMS server, NOT from localhost" (commit 6fe10112)
- 2026-05-02 incident: trail-landing 5-time Beam saga
