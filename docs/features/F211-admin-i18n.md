# F211 — Admin på flere sprog (ægte i18n)

## Ejerens svar (Christian, 22/10-2026)
1. **Kildesprog:** engelsk forbliver kildesprog i kataloget (koden er engelsk, D-55c9d6). Dansk er det første oversatte sprog og håndrettet. — «Ja»
2. **Sprog:** «Kun Dansk indtil videre». De ~10 LLM-oversatte sprog er udskudt; arkitekturen skal stadig kunne tage dem uden kodeændringer (F211.4 står i Backlog, ikke planlagt).
3. **Standardsprog pr. brand:** cms.fysio.work åbner på dansk som standard — «Ja». Brandpakken fra F210 får `defaultLocale`.

## Motivation
fysio.work (F210) sælger klinik-websites på vores CMS til danske klinikker. En dansk klinikejer skal kunne bruge admin på dansk. Christian vil ikke have en dansk kopi, men ægte i18n, så flere sprog senere kan tilføjes som ren oversættelse.

## Scope
- Al brugervendt tekst i cms-admin (sider, sidebar, dialoger, toasts, fejl, tomme tilstande) flyttes til et tekstkatalog pr. sprog: `en` (kilde) og `da`.
- Sprogvalg pr. bruger, gemt på serveren (feedback: server-side prefs), med fallback: bruger → brandets defaultLocale → browser → engelsk.
- Port i CI: manglende danske nøgler og nye hårdkodede strenge i komponenter fejler bygget.

## Non-goals
- Flere sprog end dansk nu (F211.4 udskudt).
- Indholdets sprog (sitets dokumenter) — det har F48 allerede.
- Mails og fejlsider (F210.4) — kan genbruge kataloget senere.
- Mobilappen (F07) — på pause, appen virker ikke p.t. (Christian 22/10).
- RTL-sprog.

## Reuse
- **`@broberg/i18n` 0.1.0** (components): headless `createI18n()`, dot-path `t()`, fallback-kæde, `{var}`-interpolation. Singletonen er IKKE sikker på serveren (components bekræftede 22/10) — brug den ikke i server-komponenter. components har oprettet:
  - **components-F019.9**: ren `translate(messages, locale, key, vars)` pr. request + flertal via `Intl.PluralRules` — **blokerer F211.1**, venter på at ejeren lægger den i Ready.
  - components-F019.5: lazy-load (findes).
  - components-F019.10: `missingKeys` + `fillMissing` via @broberg/ai-sdk EU (til F211.4 senere; missingKeys bruges af CI-porten).
  **Udvid pakken, byg ikke ved siden af.**
- **`@broberg/ai-sdk`** (Mistral EU) — kun relevant når F211.4 genoptages.
- Eksisterende: `lib/locale.ts` (indholds-locale) — genbruges ikke til UI, men navnekonflikt undgås.

## Arkitektur-skitse
- `packages/cms-admin/src/i18n/messages/{en,da}.json` — nøgler grupperet pr. område (`sidebar.*`, `settings.*`).
- Server: locale afgøres pr. request (bruger-pref + brand fra F210 `resolveBrand(host)`), sendes til en `I18nProvider` i `app/layout.tsx` ved siden af `BrandProvider`. Kun det valgte sprog sendes til browseren. Ingen modul-global tilstand (CMS-reglen om process-global state).
- Klient: `useT()` hook. Server-komponenter: `getT()` bygget på F019.9's rene `translate`.
- Udtræk sker område for område (sidebar → login → dashboard → editor → settings …), så admin aldrig er halvt brudt: nøgle mangler → engelsk fallback.
- Port: test der scanner `.tsx` for JSX-tekst/brugervendte string-props uden `t()` (ratchet: tallet må kun falde) + missing-key-rapport for `da`.

## Afhængigheder
- components-F019.9 (blokerer F211.1).
- F210.1 brandpakke (Done) — får `defaultLocale`.

## Rollout
1. Fundament + sprogvælger (engelsk uændret = ingen synlig forskel).
2. Udtræk område for område med dansk ved siden af.
3. Dansk komplet → standard på cms.fysio.work.
4. (Udskudt) LLM-oversættelse til flere sprog.

Grov størrelse: ~1.800 unikke tekststykker i cms-admin (grep-estimat 22/10, ikke præcist).
