# F208 — Tre tværgående site-huller

**Kilde:** components intercom #39275 (kodelæsning, F029.7). **Ordre:** Christian 13/10-2026 «Kortlæg og ret».

## Kortlægning (målt på prod webhouse-app 13/10)

| # | Hul | Live i dag? |
|---|---|---|
| 1 | `resolveToken("oauth")` falder tilbage til (2.5) installationens globale GitHub-nøgle og (3) den FØRSTE nøgle fundet i et vilkårligt sites cache-mappe. Ét sites nøgle kan bruges for et andet site. | Nej. Prod har 2 nøglefiler: global + trail. Kun trail deployer via GitHub, og har sin egen. Trin 3's mappe er tom. |
| 2 | `GET /api/cms/registry` giver en session hvis bruger ikke findes i users.json rollen `admin` → hele registret. Rammer en bruger der er slettet mens hans 7-dages session stadig gælder. | Nej. 2 brugere, begge med eksplicit rolle. |
| 3 | Site-id er kun unikt pr. org; `/admin/switch/[slug]`, proxy-slug-routeren og `?site=` tager første match på tværs af orgs. GitHub-sites' datamappe er nøglet på site-id alene, så to orgs med samme id ville DELE team.json + nøgle. | Nej. 4 sites, ingen dubletter. |

Alle tre er latente — men hver kræver kun én almindelig handling (slet en bruger, opret et site med et id der findes i en anden org) for at blive aktiv.

## Rettelser (F208.1)

1. `resolveToken("oauth")`: kun brugerens egen cookie, ellers det AKTIVE sites egen service-nøgle, ellers fejl. Trin 2.5 og 3 fjernes.
2. Registry GET: session uden bruger i users.json → 401. `role ?? "admin"` for en EKSISTERENDE bruger uden rolle bevares (dokumenteret legacy: første bruger = admin; `deleteUser`'s sidste-admin-vagt bygger på samme regel) — at ændre det kan låse en selvhostet ejer ude.
3. Site-id globalt unikt: `addSite` afviser et id der findes i en ANDEN org; add-site-ruten svarer 409 hvis id'et findes nogen steder (den overskrev ellers team.json ved dublet). Opslag på tværs af orgs går gennem én helper `findSiteOrgId()`, der returnerer null ved tvetydighed (fail-closed).

## Non-goals
- Ingen ændring af default-rolle for eksisterende brugere uden rolle.
- Ingen migrering — prod har ingen dubletter og ingen afhængighed af de fjernede fallbacks.

## Reuse
Intet nyt; eksisterende site-registry/auth.

## Udrulning
Tests først (røde), så rettelse, tsc + vitest, commit, auto-deploy.
