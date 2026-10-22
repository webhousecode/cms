# F211 — Admin på flere sprog (ægte i18n)

## Åbne spørgsmål (til Christian)
1. **Kildesprog i koden:** admin er i dag skrevet på engelsk. Forslag: engelsk forbliver kildesprog i kataloget (koden er engelsk, D-55c9d6), dansk er det første *oversatte* sprog og håndrettet. Alternativ: dansk som kilde. Påvirker kun hvor LLM-oversættelsen starter fra.
2. **De ~10 sprog:** hvilke? Forslag: da, en, sv, nb, de, nl, fr, es, it, pl, fi.
3. **Standardsprog pr. brand:** skal cms.fysio.work åbne på dansk som standard (forslag: ja — brandpakken fra F210 får et `defaultLocale`).

## Motivation
fysio.work (F210) sælger klinik-websites på vores CMS til danske klinikker. En dansk klinikejer skal kunne bruge admin på dansk. Christian vil ikke have en dansk kopi, men ægte i18n, så en LLM kan oversætte til ~10 sprog uden kodeændringer.

## Scope
- Al brugervendt tekst i cms-admin (sider, sidebar, dialoger, toasts, fejl, tomme tilstande) flyttes til et tekstkatalog pr. sprog.
- Sprogvalg pr. bruger, gemt på serveren (feedback: server-side prefs), med fallback: bruger → brand-standard → browser → engelsk.
- Dansk håndrettet. Øvrige sprog genereres af LLM via `@broberg/ai-sdk` (Mistral EU) med ordliste, og markeres «maskinoversat» indtil rettet.
- Port i CI: manglende nøgler og nye hårdkodede strenge i komponenter fejler bygget.

## Non-goals
- Indholdets sprog (sitets dokumenter) — det har F48 allerede.
- Mails og fejlsider (F210.4) — kan genbruge kataloget senere, men er ikke del af første levering.
- Mobilappen (F07).
- RTL-sprog.

## Reuse
- **`@broberg/i18n` 0.1.0** (components): headless `createI18n()`, dot-path `t()`, fallback-kæde, `{var}`-interpolation. Mangler til os: server-sikker per-request-instans (ingen modul-global tilstand — CMS-reglen om process-global state), flertal, lazy-load af sprogfiler, rapport over manglende nøgler, LLM-oversætter-CLI. Bedt om i intercom #3747. **Udvid pakken, byg ikke ved siden af.** Hvis components ikke når det, bygges udvidelserne som PR til pakken.
- **`@broberg/ai-sdk`** til oversættelse (tier `cheap`/`smart`, Mistral EU). Ingen persondata i UI-tekster.
- Eksisterende: `lib/locale.ts` (indholds-locale) — genbruges ikke til UI, men navnekonflikt undgås.

## Arkitektur-skitse
- `packages/cms-admin/src/i18n/messages/{en,da,…}.json` — nøgler grupperet pr. område (`sidebar.*`, `settings.*`).
- Server: locale afgøres pr. request (cookie/bruger-pref + brand fra F210 `resolveBrand(host)`), sendes til en `I18nProvider` i `app/layout.tsx` ved siden af `BrandProvider`. Kun det valgte sprog sendes til browseren.
- Klient: `useT()` hook. Server-komponenter: `getT()`.
- Udtræk sker område for område (sidebar → login → dashboard → editor → settings …), så admin aldrig er halvt brudt: nøgle mangler → engelsk fallback.
- Port: test der scanner `.tsx` for JSX-tekst/brugervendte string-props uden `t()` i allerede-migrerede områder (ratchet: tallet må kun falde).

## Afhængigheder
- components: udvidelser af `@broberg/i18n` (#3747).
- F210.1 brandpakke (for `defaultLocale` pr. brand).

## Rollout
1. Fundament + sprogvælger (engelsk uændret = ingen synlig forskel).
2. Udtræk område for område med dansk ved siden af.
3. Dansk komplet → slå til på cms.fysio.work.
4. LLM-oversættelse til resten, markeret maskinoversat.

Grov størrelse: ~1.800 unikke tekststykker i cms-admin (grep-estimat 22/10, ikke præcist).
