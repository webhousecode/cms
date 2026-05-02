# F143 — Common Build Server (cms-admin native build host)

**Status:** planned
**Owner:** cms-core
**Priority:** Tier 1 (unblocks "filesystem sites publish from anywhere" — short-term path)
**Estimat:** 6-8 fokuserede dage (oprindelige 3-5 + auto-detect Phase 4 + dependency lifecycle Phase 5)
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
│   ├── dep-scanner.ts        ← AUTO: parse build.ts → list of npm imports
│   ├── extra-deps.ts         ← on-demand pnpm install (background-queued)
│   ├── install-queue.ts      ← serialise pnpm installs på Fly volumen
│   └── log-streamer.ts       ← pipe stdout/stderr → Deploy-modal SSE
└── /var/cms-admin/build-deps/
    └── <hash-of-deps>/
        └── node_modules/     ← installed once, reused on tværs af sites
```

### Auto-detect npm dependencies fra build.ts (no manual config required)

Når et site **registreres** (Add Site), **beames ind** (Beam-finalize), eller **build.ts ændres** (filesystem watcher / commit-trigger), kører cms-admin auto-detection:

```
1. Læs site's build.ts (+ enhver .ts fil i samme mappe build.ts importerer fra)
2. Parse via es-module-lexer (fast, no AST overhead) — extract alle `import x from 'pkg'` + `require('pkg')` + `import('pkg')` statements
3. For hver string: filtrér væk
   - `node:`-builtins (`node:fs`, `node:path`, ...)
   - relative paths (`./utils`, `../shared`)
   - core-deps der allerede er pre-installed i cms-admin's package.json
4. For scoped pakker (`@webhouse/cms`) eller submodul-imports (`marked/lib/X`):
   normaliser til root-pakkenavnet (`@webhouse/cms`, `marked`)
5. Resultatet er listen af extra deps sitet har behov for
6. Hvis listen ≠ tom: enqueue background pnpm install i build-deps store
```

Dette gør `cms.config.ts.build.deps`-feltet **valgfrit** — du behøver kun bruge det når du vil pinne en specifik version (`'three@^0.158.0'`) eller deklarere en dep der ikke kommer fra static import (fx en CLI tool build.ts spawner via `execSync`).

### Background-install på Fly.io

Auto-detect kører ved 3 events: site-register, Beam-finalize, build.ts-changed. Installen er **non-blocking**:

```
Trigger detected (build.ts has new import)
   │
   ▼
install-queue.enqueue({ siteId, deps: [...] })
   │
   ▼ (worker tager fra køen, max 1 concurrent install pr volumen)
   │
pnpm install --prefix /var/cms-admin/build-deps/<hash> <deps...>
   │
   ▼ (skrives til install-status.json: { hash, status, log, finishedAt })
   │
Site marker som "deps-ready" → rocket-knappen er nu enabled
```

Live-status vises i Deploy-modal: "Installing 2 new packages: three, d3-force…" med live progress fra pnpm. Når den er færdig flipper Deploy-knappen fra disabled til enabled.

**Hvis bruger trykker rocket FØR install er færdig:** modal venter, viser install-progress + "deploy will start when packages are ready". Ingen fejl, bare en tydelig "vent et øjeblik".

**Hvis install fejler** (network outage, package udgivet med broken deps, etc.): modal viser pnpm error verbatim, deploy-knappen forbliver disabled, retry-knap synlig. Site forbliver i "deps-pending" state indtil manuelt fix eller dep-list ændres.

### Cms.config.ts.build.deps — manual override (valgfri)

Auto-detect dækker 99%. Brug `build.deps` kun når du vil:

- **Pinne en version** for reproducerbarhed:
  ```ts
  build: { deps: ['three@^0.158.0', 'marked@^15.0.0'] }
  ```
- **Tilføje en dep der ikke kommer fra static import** (fx en CLI build.ts spawner):
  ```ts
  build: { deps: ['imagemin-cli'] }  // build.ts kalder `npx imagemin-cli`
  ```
- **Force-include en dep** der auto-scanneren overså (rare edge case):
  ```ts
  build: { deps: ['some-dep-only-loaded-via-string-eval'] }
  ```

Når både auto-scan og manual deps eksisterer, **manual wins** for samme pakke (giver pin-versions). Auto-detected deps der ikke er manuelt overstyret bruger `latest`.

### Build trigger flow (efter F143)

```
User trykker rocket på site X
  │
  ├─ Læs cms.config.ts → manual build.deps + auto-scanned deps fra build.ts
  │
  ├─ Compute combined NODE_PATH:
  │     1. cms-admin's egen node_modules (core deps)
  │     2. /var/cms-admin/build-deps/<hash>/node_modules (hvis extra deps)
  │
  ├─ Hvis install allerede er kørt (auto-detect ved site-register/beam):
  │     hash findes, springer install over → øjeblikkelig deploy
  │
  ├─ Hvis hash mangler (sjældent — kun hvis auto-scan blev sprunget):
  │     install-queue + vent → Deploy-modal viser install-progress
  │
  ├─ Spawn child_process: NODE_PATH=<combined> npx tsx <projectDir>/build.ts
  │     stdout/stderr piped → Deploy-modal SSE
  │
  └─ Output i deploy/ → push til host (gh-pages / CF Pages / Fly static)
```

**Vigtig konsekvens af auto-detect:** for 99% af deploys er der **ingen ventetid på install** ved rocket-tryk — installen er allerede kørt i baggrunden da sitet blev registreret eller beamed.

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

### Dependency lifecycle + version control (PIN-FIRST)

Det vigtigste princip: **vi opgraderer aldrig automatisk**. Auto-DETECT installerer nye deps; auto-OPGRADERING af eksisterende deps sker kun via eksplicit user action. Det forhindrer at "build virkede i går"-bug klassen.

#### 3 lag af versions-kontrol

**Lag 1 — cms-admin's core-deps (marked, sharp, gray-matter, slugify, marked-highlight)**
- Pinnes i `packages/cms-admin/package.json` med `^x.y.z` ranges
- Renovate / Dependabot foreslår PR'er ved nye versioner
- Hvert PR kører den fulde test-suite + en "build trail-landing"-smoke-test (en kanariesite der bruger alle core deps)
- Mergning kræver grøn CI = breaking core-dep change kan ikke nå prod uden at vi ser det

**Lag 2 — auto-detected site-deps (uden eksplicit version)**
- Når auto-scanneren opdager `import foo from 'lodash'` uden at brugeren har specificeret version i `build.deps`, kalder cms-admin `pnpm view lodash version` og **pin'er den exakte version** ved install-tidspunktet
- Pinned version skrives ind i en **per-site lockfile**: `/var/cms-admin/build-deps/<hash>/pnpm-lock.yaml`
- Hash'en for build-deps-mappen INKLUDERER de pin'ede versioner — så `lodash@4.17.21` og `lodash@4.17.22` har forskellige hashes og forskellige installationer
- **Resultat**: en ny site, beamed i dag, får `lodash@4.17.21`. Næste site beamed i morgen får måske `4.17.22` (hvis npm har ny version), men det første site rører IKKE sin pinned version. Det "fryses" i tid

**Lag 3 — manual `cms.config.ts.build.deps` (fuld kontrol)**
- Brugeren skriver eksplicit semver-range: `'three@^0.158.0'`
- pnpm respekterer rangen ved install; lockfile pinner den faktiske resolved version
- Ved manuel upgrade: brugeren ændrer rangen, cms-admin re-installerer, lockfile opdateres

#### Upgrade UI (manuel, ikke auto)

I cms-admin: **Site Settings → Build → Dependencies**:

```
Site: trail-landing
─────────────────────────────────
Core (provided by cms-admin):     marked 15.2.1   gray-matter 4.0.3   sharp 0.34.0   …
                                  ↑ upgraded by cms-admin team — see CHANGELOG

Auto-detected (pinned at first install):
  lodash         4.17.21    → [Check for updates]   ⚠ 4.17.22 available (patch)
  three          0.158.0    → [Check for updates]   ✓ up to date
  d3-force       3.0.0      → [Check for updates]   ⚠ 4.0.0 available (MAJOR — breaking)

Manual override (cms.config.ts.build.deps):
  marked         ^15.0.0    → resolves to 15.2.1
```

Når bruger trykker `[Check for updates]`:
1. cms-admin kalder `pnpm view <pkg> versions --json`
2. Viser available versions + changelog link (hvis findes på npm)
3. Patch updates: green "safe", marked + click-to-apply
4. Minor updates: yellow "review changelog", click-to-apply
5. Major updates: red "BREAKING — read changelog first", confirm-to-apply
6. Når bruger applies: cms-admin kører **smoke-build i sandbox** først (se nedenfor); kun hvis grøn, promote til site

#### Smoke-build før upgrade promotes

Hver upgrade gennemgår en automatisk verifikation før den lander:

```
1. Klon eksisterende deps-dir: <hash>/ → <hash>-trial/
2. pnpm install --prefix <hash>-trial <pkg>@<new-version>
3. Spawn build.ts mod <hash>-trial som NODE_PATH
4. Sammenlign output:
   - Exit code 0 ✓
   - deploy/ directory eksisterer + ikke tom ✓
   - HTML output diff vs. den seneste successfulde build < 5% ændringer (heuristik for "intet brækket synligt")
5. Hvis 1-4 alle grønne: rename <hash>-trial → <hash> (atomic), gammel arkiveres som <hash>-prev
   Hvis fejl: slet <hash>-trial, vis fejl-log + diff i UI, brugeren afviser eller fortsætter manuelt
```

**Rollback**: hver site holder seneste `<hash>-prev` i 7 dage. UI har "Rollback to previous version" knap. Genaktiverer den tidligere lockfile + node_modules atomisk.

#### Sikkerhedsscanning + advarsler

- `pnpm audit` kører ugentligt mod alle aktive build-deps stores
- Vulnerabilities (severity ≥ moderate) vises i Site Settings + cms-admin's hjem-dashboard ("3 sites have outdated deps with known CVEs")
- Brugeren ser konkret: "lodash@4.17.21 has CVE-2026-XXXXX (medium). Patch available in 4.17.22 — [Apply]". Ingen auto-apply
- Critical CVEs (severity = critical, exploit i wild): cms-admin sender notification + flag på Deploy-knappen ("Last build used vulnerable dep")

#### Drift-detection

Hver gang et site bygges, sammenligner cms-admin lockfile-version mod manual `build.deps` range. Hvis manual range har ændret sig OG resolved version differerer fra lockfile: trigger upgrade-flow med smoke-build (se ovenfor). Forhindrer at en bruger der manuelt redigerer `build.deps` får en stille opgradering uden verifikation.

#### Eksempel-scenarie

```
Mandag:  AI session tilføjer `import slugify from 'slugify'` til build.ts
         → auto-detect → pnpm view slugify version → "1.6.6"
         → install slugify@1.6.6 i ny build-deps dir
         → lockfile pin'er 1.6.6
         → site builder + deployer

Tirsdag: slugify@2.0.0 udgives med breaking changes
         → cms-admin rører IKKE sitet — site fortsætter på 1.6.6
         → Site Settings viser "slugify 1.6.6 → ⚠ 2.0.0 (MAJOR)"

Onsdag:  Bruger trykker "Update", læser changelog, accepter
         → cms-admin kloner deps til <hash>-trial
         → installerer slugify@2.0.0
         → bygger build.ts mod trial
         → output diff = 18% (signifikant), exit code 0
         → UI viser "Build succeeded but output differs significantly. Review preview before promoting."
         → bruger inspekterer preview, accepterer eller afviser

Hvis bruger AFVISER: <hash>-trial slettes, site forbliver på 1.6.6
Hvis bruger ACCEPTER: trial bliver til ny <hash>, site bygger fremover med 2.0.0,
                      <hash>-prev gemmes i 7 dage for rollback
```

#### Hvad det IKKE løser (eksplicitte non-goals)

- **Transitive deps**: hvis `slugify@1.6.6` bruger `some-internal-dep@^1.0.0` og det opgraderes til `1.5.0` med en bug, fanger vi det først ved næste build (ikke ved install). Acceptabelt — pnpm har en lockfile, så transitive bumps sker også kun ved eksplicit upgrade
- **Coordinated upgrades på tværs af sites**: hvis 5 sites bruger lodash, og du opgraderer site A, opgraderes B-E ikke. Hvert site er sin egen build-deps-hash. (Senere F kan tilføje "bulk upgrade across sites" UI hvis behov opstår)
- **Pre-1.0 deps**: pakker på `0.x.y` semver-range har ingen stabilitetsgaranti; cms-admin viser ekstra advarsel ved upgrades

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

## Rollout — 5 phases

### Phase 1 — Foundation (1 dag)
- Add core-deps til cms-admin/package.json: marked, gray-matter, slugify, sharp, marked-highlight
- Implement `dep-resolver.ts`: compute NODE_PATH for given build
- Implement `runtime.ts`: spawn child_process med NODE_PATH set
- Test: kør en eksisterende site's build.ts gennem den nye runner, verificér identisk output

### Phase 2 — Beam-fix (0.5 dag)
- Udvid Beam's source-list til at inkludere build.ts + cms.config.ts + tsconfig.json + public/ (eksklusive node_modules, .next, dist, deploy)
- Tests: re-Beam trail-landing, verificér at /data/cms-admin/beam-sites/trail/ får alt det nødvendige UNDTAGEN node_modules

### Phase 3 — Extra-deps system (1 dag)
- Implement `cms.config.ts.build.deps` parsing (manual override path)
- Implement `/var/cms-admin/build-deps/<hash>/` content-addressable store
- Implement on-demand `pnpm install` ved første brug af et nyt deps-set
- Tests: site med extra deps deployer succesfuldt fra både lokal og webhouse.app

### Phase 4 — Auto-detect + background install (1-1.5 dag)
- Implement `dep-scanner.ts` med es-module-lexer:
  - Parse build.ts (+ enhver .ts som build.ts importerer fra samme mappe)
  - Extract `import x from 'pkg'` + `require('pkg')` + dynamic `import('pkg')` strings
  - Filtrér node:-builtins, relative paths, og deps der allerede er pre-installed i cms-admin
  - Normaliser scoped (`@webhouse/cms`) og submodul (`marked/lib/X` → `marked`) imports
- Implement `install-queue.ts`: serialise pnpm installs på Fly volumen, max 1 concurrent (deps-store skrives til fællesvolumen, undgå race conditions)
- Hook auto-detect ind på 3 events:
  1. `POST /api/admin/sites` (Add Site) — efter site er registered, kør scan + queue install hvis nye deps
  2. `POST /api/admin/beam/finalize` — efter Beam-import, kør scan + queue install
  3. Filesystem watcher på build.ts (kun ved filesystem-adapter sites) — debounce 5 sek, scan + queue ved change
- Skriv `install-status.json` per hash: `{ status: 'pending'|'installing'|'ready'|'failed', log, deps, finishedAt }`
- Deploy-modal læser install-status: hvis pending/installing → vis live progress + disable Deploy-knap; hvis failed → vis error + retry; hvis ready → enable Deploy-knap
- Tests:
  - Add a new site med build.ts der importerer `lodash` → verificér lodash bliver auto-installed i baggrund
  - Beam et site med build.ts der bruger `three` → verificér install starter umiddelbart efter beam-finalize
  - Edit build.ts til at tilføje en ny import → verificér install kører automatisk via filesystem watcher

### Phase 5 — Dependency lifecycle (PIN-FIRST + upgrade UI) (2 dage)
- Auto-detect installer pin'er exact version (via `pnpm view <pkg> version`) i stedet for `latest`
- Per-deps-set `pnpm-lock.yaml` skrives + indgår i hash-beregning så lockfile-ændringer giver nye build-deps mapper
- "Site Settings → Build → Dependencies" UI: liste over auto-detected + manual deps, [Check for updates] knap pr dep, semver-koded farveindikator (patch/minor/major)
- Smoke-build pipeline før upgrade promotes: klon deps-dir til `<hash>-trial`, install ny version, kør build, sammenlign output diff, kun promote ved success + acceptable diff
- 7-dages `<hash>-prev` rollback-historik pr site
- Ugentlig `pnpm audit` cron + UI-surface af CVEs
- Tests: simuler "deploy med slugify@1.6.6, slugify@2.0.0 udgives, smoke-build fejler, ingen auto-promotion"

### Phase 6 — Pilot + cleanup (1 dag)
- Pilot: trail-landing — slet `apps/landing/node_modules` og `package-lock.json`, behold build.ts. Re-Beam. Verificér auto-detect kører på beam-finalize, marked auto-installeres pinned-version, og rocket fra webhouse.app virker uden manuel intervention.
- Update Beam UI: vis explicit at "build environment provided by cms-admin" + live install-progress under beam-finalize
- Document i AI Builder Guide og README — herunder at AI/dev sessions IKKE behøver opdatere `cms.config.ts.build.deps` manuelt; auto-detect står for det. PIN-FIRST adfærd dokumenteret eksplicit så AI'er ikke forventer auto-upgrade

## Acceptance criteria

1. `/data/cms-admin/beam-sites/trail/` har **ingen `node_modules`**
2. Trail-landing's rocket-knap fra webhouse.app's admin succesfuldt bygger og pusher til gh-pages
3. Build-output identisk til hvad localhost producerer (HTML diff = 0 bytes)
4. Build-tid <5 sec for trail-landing (samme som lokalt)
5. Site med `build.deps: ['three']` declared deployer succesfuldt; second site med samme deps genbruger installation (no re-install)
6. Concurrent rocket-trigger på 2 sites blokkerer ikke hinanden (queue fungerer)
7. **Auto-detect**: Add Site med en build.ts der importerer `lodash` triggerer baggrunds-install af `lodash` UDEN at brugeren manuelt skal opdatere `cms.config.ts.build.deps`
8. **Auto-detect on beam**: Beam-import af et nyt site triggerer auto-scan + install ved finalize, så Deploy-knappen er enabled fra første sekund efter beam er færdig (eller venter med tydelig progress hvis install stadig kører)
9. **Auto-detect on edit**: AI/dev session som ændrer build.ts og tilføjer en `import { foo } from 'new-pkg'` får automatisk `new-pkg` installeret uden manuelt indgreb, inden næste deploy
10. **PIN-FIRST**: Auto-detected dep installeres med exact pinned version. Kald site-deps endpoint næste dag — version er UÆNDRET selvom npm har en nyere udgave. Ingen stille drift
11. **Upgrade UI**: bruger ser "[Check for updates]" pr dep, semver-koded (green/yellow/red), kan klikke for changelog
12. **Smoke-build before promote**: bruger trykker upgrade på en dep der har breaking change → cms-admin builder mod trial-deps, output-diff > threshold → upgrade afvises eller kræver eksplicit confirmation
13. **Rollback**: efter en upgrade, "Rollback to previous version" knap virker; gammel `<hash>-prev` reaktiveres atomisk, site bygger fremover med gamle versioner
14. **CVE surface**: `pnpm audit` finder en moderate CVE i en site's dep → vises i Site Settings + på cms-admin's hjem-dashboard. Ingen auto-apply

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| sharp's native binaries differerer mellem lokal Mac og Fly Linux | Mellem | sharp shipper alle platform-binaries; cms-admin's package.json pin'er sharp-version, alle hosts er Linux container i prod |
| extra-deps install hænger / fejler første gang | Lav-mellem | Timeout + retry + clear error i Deploy-modal |
| pnpm content-store fylder volumen op | Lav | Cleanup job: slet build-deps directories der ikke har været tilgået i 30 dage |
| build.ts skriver til steder uden for projectDir | Lav | child_process kører som non-root user med begrænset write-access (kun til projectDir/deploy/) |
| **Auto-scanner overser en dep** (fx loaded via dynamic string-eval, eller import-side-effect uden symbol use) | Lav-mellem | Manual `cms.config.ts.build.deps` override eksisterer netop til disse cases. Build fejler tydeligt med "Cannot find module 'X'" — bruger tilføjer X til `build.deps` |
| **Auto-scanner false-positive** (matcher en streng der ligner en import) | Meget lav | es-module-lexer er AST-baseret, ikke regex — false positives er praktisk udelukket |
| **Auto-install på Fly er langsom og blokkerer Beam-finalize** | Mellem | Install kører i baggrund (non-blocking) — beam-finalize returnerer som normalt; Deploy-knap aktiveres når install er færdig (sekunder for almindelige deps fra pnpm content-store) |
| **Race condition: 2 sites beames samtidigt med samme deps** | Lav | install-queue serialiserer (max 1 concurrent på samme volumen); andet site får "deps ready" instant uden at re-installere |
| **Smoke-build false-positive** (build succeeder mod ny dep, men site er reelt brækket på en måde HTML-diff ikke fanger) | Mellem | Diff-threshold er heuristik, ikke garanti. UI viser preview-link så bruger kan visuelt verificere før accept. Rollback altid tilgængelig i 7 dage |
| **Smoke-build false-negative** (build fejler mod ny dep selvom upgrade ER sikker — fx unrelated network glitch under install) | Lav-mellem | Smoke-build retry 3× ved transient errors; bruger kan force-promote efter manual review |
| **Transitive dep regression** (slugify@1.6.6 OK, men dens transitive `internal-dep@1.5.0` har bug) | Mellem | pnpm-lock pin'er hele træet ved hver install; transitive bumps kan kun ske ved eksplicit upgrade. Smoke-build kører ved upgrade — fanger 80%+ |
| **Dep med post-install script kører malicious code på Fly volumen** | Mellem | pnpm har `--ignore-scripts` flag; for ekstra sikkerhed kan vi køre installs i sandboxed child_process med begrænset filesystem-access. Default for F143: `--ignore-scripts` ON, brugere kan opt-in via per-site flag |
| **CVE notification flood** (pnpm audit melder 50 vulnerabilities pr site) | Mellem | Aggreger pr CVE-ID; vis kun én notification per unique CVE selv hvis 10 sites er ramt. Suppress non-actionable info-niveau alerts |
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
