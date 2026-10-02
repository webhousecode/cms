# F206 — Hvert site bygger selv; webhouse.app er kun CMS

## Motivation

Christian, 2/10-2026: «GO til løsning 1 vi skal fra nu af KUN have repos der bygger ALT selv omkring deres sites og DU laver CMS» — og «Det er en global decision værds» (foreslået som global beslutning 01a0fe5c).

Baggrund målt samme dag:
- trailmem.com blev bygget på webhouse.app fra en Beam-kopi af build.ts fra maj, 435 linjer bag trails repo.
- F205.3 (hent byggekoden fra repoet) viste sig ved egen sikkerhedsgennemgang at give alle med push-adgang til site-repoet kontrol over webhouse.app: buildet arver hele serverens miljø (FLY_API_TOKEN, CMS_JWT_SECRET, SSO/GitHub-secrets, AI-nøgler) og læser alle sites' filer på /data. Slukket for trail samme aften.

Princip: kode fra et site-repo kører ALDRIG på CMS-serveren. CMS'et gemmer indhold, udleverer det (read-only API med site-låste nøgler, F205) og sender «byg nu» til sitets eget repo.

## Inventar (prod, 2/10)

| site | bygges i dag | |
|---|---|---|
| webhouse-site | selv (ICD) | allerede i mål |
| sanneandersen | selv (ICD) | allerede i mål |
| broberg-ai | selv (ICD) | allerede i mål |
| trail | på webhouse.app (build.ts, github-pages → broberg-ai/trail-site) | flyttes |

## Stories

- **F206.1** Fjern repo-overlay (F205.3-koden) fra webhouse.app — koden er i strid med beslutningen og kan slås til af enhver admin.
- **F206.2** trail bygger i egen GitHub Actions; webhouse.app's deploy for trail = workflow_dispatch (eksisterende «webhook»-udbyder).
- **F206.3** webhouse.app kører aldrig site-byggekode i produktion — de server-side build-udbydere slås fra når ingen site bruger dem, med en test der beviser det.
- Berigelsen (canonical/og/sitemap/llms) som eksport: **F205.5** (allerede på tavlen) — for udætning af F206.2.

## Non-goals

- At flytte indhold ud af CMS'et.
- Selvhostede @webhouse/cms-installationer: lokal `cms build` på egen maskine er uberørt.

## Rollout

F205.5 → F206.2 (trail live via eget repo, målt) → F206.1 + F206.3. Ingen nøgen overgang: webhouse.app's egen build for trail slås først fra når trails workflow er bevist live.

## Reuse

Eksisterende «webhook»-deployudbyder (`postHook`, workflow_dispatch), F205's site-låste nøgler, content-API'et. Ingen ny pakke ud over F205.5's eksport.
