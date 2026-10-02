# F205 — Adgangsnøgler skal være begrænset til deres site og rettigheder

## Motivation

Christian, 2/10-2026: «ja, opret kort på nøgleproblemet».

Fundet 2/10, da trail-sessionen bad om en wh_-nøgle med `content:write` + upload, begrænset til site `trail`. Målt i koden:

- `packages/cms-admin/src/proxy.ts:388-406`: ENHVER gyldig `wh_`-Bearer laves om til en cms-session-JWT med `role: "admin"`. `scopes` lægges på JWT'en, men ingen handler læser dem.
- Site-begrænsningen på nøglen bliver ikke håndhævet nogen steder i proxy-stien. Et kald med `?site=<andet-site>` får admin dér også.
- `requireToken()` / `requirePermission()` har deres egen token-sti (`tryTokenAuth`), men den rammes ikke, fordi proxy allerede har konverteret Bearer → cookie. Den mapper desuden `content.edit` → `content:edit` mens nøgle-UI'et udsteder `content:write`, og den tjekker ressourcen `org:*`, så en site-begrænset nøgle ville fejle dér alligevel.

Konsekvens: en nøgle der i UI'et ser ud som «kun indhold, kun site X» er i praksis en admin-nøgle til alle sites brugeren har adgang til. Det er den grønne-retning-fejl: alt virker, og intet siger at begrænsningen er pynt.

## Scope

1. proxy.ts sender nøglens `scopes` + site-begrænsning videre i den mintede session (ikke `role: admin`).
2. Én fælles kontrol (`getSiteRole` / `hasPermission`-kæden) afviser et kald når nøglen ikke dækker (permission, site). Ét sted, ikke pr. rute.
3. Navne-mismatchet `content.edit` vs `content:write` løses ved kilden: én tabel der mapper nøgle-scopes til permissions.
4. Eksisterende nøgler: inventér hvilke der findes og hvad de faktisk bruges til, FØR håndhævelsen slås til, så en nøgle som `broberg-ai chat relay` (CMS_ADMIN_TOKEN) ikke går i stykker uden varsel. Nøgler med `*`/admin-scope beholder admin.

## Non-goals

- Nyt nøgle-UI. Kun håndhævelse af det UI'et allerede lover.
- editSession-tokens (F157) — de har allerede deres egen allowlist i proxy.
- CMS_DEV_TOKEN (lokal dev).

## Arkitektur-skitse

- proxy.ts: ved gyldig wh_ → mint JWT med `{ sub, tokenScopes, tokenSites, role: derived }` hvor `role` kun er `admin` hvis scopes indeholder `*`.
- `getSiteRole()` læser `tokenSites`: aktivt site uden for listen → `null` (= ingen adgang).
- `hasPermission()` får nøglens scopes som permission-liste i stedet for rollens.
- Test: Bearer-kald med en trail-only content-nøgle → 200 på `PATCH /api/cms/pages/x?site=trail`, 403 på `?site=sanneandersen`, 403 på `POST /api/admin/deploy?site=trail`, 403 på `POST /api/admin/access-tokens`.

## Rollout

1. Inventér eksisterende nøgler (scopes + sidste brug). Ship-dark bag et flag der kun LOGGER afvisninger.
2. Kør en uge i log-mode, gennemgå hvad der ville være afvist.
3. Slå håndhævelse til.

## Reuse

Intet `@broberg/*`-modul ejer cms-admins egen nøgle-autorisation; dette er cms' eget permission-system (`permissions-shared.ts`). Ingen ny pakke.

## Afhængigheder

Ingen. Berører den load-bearing auth-kæde → kræver røde tests i CI før merge (Harness-kontrakt).
