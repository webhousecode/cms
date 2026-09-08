# F193 — E2E-suiten har været rød i mindst 60 kørsler

**Status:** backlog · **Repo:** webhousecode/cms · **Fundet:** 8. september 2026 (dansk tid), mens F191.8's udrulning blev verificeret

## Hvad der er målt

```
gh run list --workflow=test.yml --limit 60
  → 59 failure, 1 uafsluttet, 0 SUCCESS
  ældste af de 60: 2026-09-05T21:26Z
```

Der er **ingen grøn kørsel af Tests-arbejdsgangen inden for de seneste 60**. Streget
stopper ikke ved 5. september — det er bare der min optaelling stoppede.

Opdelt pr. job (kørsel 34260707547):

| Job | Resultat |
|---|---|
| TypeScript type-check | success |
| Unit tests | success |
| **E2E tests** | **failure — 9 fejlede, 20 bestået (8,9 min)** |

## De 9

```
e2e/suites/12-i18n.spec.ts   8 prover  — sprogfilteret på kolonnelisten (DA/EN/Kilde/Alle)
                                        + sprogsektionen på indstillingssiden
e2e/suites/01-auth.spec.ts   1 prove   — «ingen kritiske konsolfejl» på agents + curation
```

Alle otte i18n-fejl er `element(s) not found` / `toBeVisible failed` — fladen
renderer ikke det filter prøverne leder efter.

**Og det er derfor det ikke bør henlaegges som «gamle prøver».** Repoets egen
CLAUDE.md beskriver en produktionshændelse 19. maj 2026 med nøjagtig denne
signatur: `config-writer.ts` tabte `locales` og `defaultLocale` ved hver
skema-redigering, og **sprogfilteret på kolonnelisten forsvandt** fordi
`config.locales` blev `undefined`. Otte prøver der fejler på præcis den flade er
lige så sandsynligt en gentagelse som en forfalden prøve. Det skal måles før der
røres ved en prøve.

## SVARET på F193.1 (målt 8. september 2026, dansk tid)

**Produktet er i orden. Test-fixturen har aldrig haft to sprog.**

Sprogfilteret renderer kun når `siteLocales.length > 1`
(`components/collection-list.tsx:491`). Alle tre e2e-sites peger på den samme
konfiguration:

```
default/default      → examples/blog/cms.config.ts
default/cms-docs     → examples/blog/cms.config.ts
examples/simple-blog → examples/blog/cms.config.ts
```

… og den fil har **aldrig** indeholdt `locales`:

```
git log -S"locales" -- examples/blog/cms.config.ts   →  tomt
```

E2E-opsætningen sætter dem heller ikke andre steder — hverken i site-config
eller i `_data`. Otte prøver forlanger altså en flade fixturen ikke kan
producere. Det er ikke maj-hændelsen.

**Positiv kontrol, og den er hele beviset.** Med `locales: ["da","en"]` +
`defaultLocale: "da"` midlertidigt på fixturen:

```
8 passed (41.7s)
```

Alle otte. Ikke én rettet prøve — hele blokken, uden at røre produktet.
Ændringen er rullet tilbage igen; den hører til F193.2.

**Hændelses-signaturen er tjekket i DRIFT, ikke udledt.** Læst direkte på
maskinen (`flyctl ssh console`, ren læsning):

```
broberg-ai           locales: ['da', 'en']
sanneandersen        locales: ['da', 'en']
trail                (ingen — étsproget, som forventet)
webhouse-site        (ingen — étsproget, som forventet)
```

`sanneandersen` er sitet fra 19. maj. Feltet står der. **Hændelsen er ikke
vendt tilbage.**

> En fælde undervejs, noteret fordi den ville have givet det modsatte svar:
> mit første forsøg spurgte `/api/admin/site-config` med den LOKALE
> `CMS_JWT_SECRET` og fik `locales: None` for alle tre sites — hvilket ligner
> præcis den hændelse jeg ledte efter. Kaldet svarede **401**. Tre «beviser»
> på en produktionsfejl, som i virkeligheden var en afvist forespørgsel.

**Den 9. prøve** (`01-auth`, «ingen kritiske konsolfejl» på agents + curation)
er en ANDEN fejl og er ikke diagnosticeret her. Den hører til F193.2.

## Porten — præcist hvad der ER og IKKE er tilsluttet

Det første jeg troede var at udrulningen slet ikke havde en port. Det er forkert,
og forskellen betyder noget:

```yaml
# .github/workflows/deploy.yml
deploy:
  needs: check          # ← check = Typecheck + CMS core tests + CMS admin tests
```

Så en udrulning **er** spaerret af typecheck og af begge enheds-suiter. Den er
IKKE spaerret af E2E, fordi E2E bor i en anden arbejdsgang (`test.yml`) som
udrulningen ikke kender.

Konsekvensen er ikke «vi udruller uden prøver». Den er: **den ene suite der
kører i en rigtig browser er den ene der ikke kan stoppe noget** — og derfor
den der kunne stå rød i dagevis uden at nogen mærkede det. Harness-kontrakten
siger at udgivelses-jobbet skal afhænge af test-jobbet så én rød prøve blokerer;
her er halvdelen af den kontrakt opfyldt.

## Rækkefølgen, og hvorfor den er den vej

**Diagnose før port.** Tilsluttes porten først, spaerres hver eneste udrulning
fra samme minut — også dem der intet har med i18n at gøre. Det bytter en tavs
fejl for en total blokade, hvilket er den slags «rettelse» der bliver rullet
tilbage inden aften.

1. **F193.1 — hvad fejler, og er det produktet eller prøven?** Reproducer de 8
   i18n-fejl lokalt. Er sprogfilteret væk på en rigtig skærm, er det en
   produktionsfejl med fortilfælde (19/5) og alt andet venter på den.
2. **F193.2 — gør dem grønne.** Enten rettes produktet, eller prøven rettes til
   den flade der faktisk er rigtig. Aldrig ved at slå prøven fra.
3. **F193.3 — tilslut porten.** Først når suiten er grøn: udrulningen skal
   afhænge af E2E, så den næste røde stopper noget i stedet for at blive tællet.

## Reuse

Discovery-søgt før planen: der findes intet `@broberg/*`-modul for CI-porte —
det er arbejdsgangs-konfiguration i dette repo, ikke en delt evne. Genbrugt i
stedet: repoets egen `needs:`-kobling i deploy.yml, som allerede gør det rigtige
for enheds-suiterne og bare skal udvides. Intet nyt at melde til `components`.

## Ikke i scope

- Ingen prøver slås fra, springes over eller markeres `skip` for at få grønt.
  En rød prøve betyder at ledningen er i stykker — så retter man ledningen.
