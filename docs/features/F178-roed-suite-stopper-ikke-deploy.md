# F178 — En rød testsuite kan ikke stoppe et deploy

**Status:** Backlog
**Fundet:** 28. august 2026
**Prioritet:** kritisk (men se rækkefølgen — den må IKKE armes først)

---

## Hvordan det blev fundet

Jeg jagtede en test der fejlede med jævne mellemrum uden at efterlade et spor, og stillede mig selv spørgsmålet: *blokerer den overhovedet noget?*

Svaret er nej. **Ingen test i dette repo blokerer noget som helst.**

## Målt i workflow-filerne

```yaml
# deploy.yml:35
- name: Run tests
  run: pnpm test:run || echo "⚠️ Tests with native modules skipped on CI"

# deploy.yml:39
deploy:
  needs: check          # <- ser ud som en port
```

`||` sluger **enhver** fejl. Jobbet lykkes altid, så `needs: check` er en afhængighed uden indhold.

Samme mønster tre steder mere:

| Fil | Linje | Hvad |
|---|---|---|
| `deploy.yml` | 35 | `\|\| echo` på hele suiten — deploy til Fly |
| `publish.yml` | 58 | samme på npm-udgivelsesvejen |
| `_release-build.yml` | 87 | `continue-on-error: true` på cms-admins 1246 tests |
| `test.yml` | 61, 67 | **kører ikke grønt** — se F178.4 — og intet afhænger af den |

Så: alle 1246 tests kan være røde, og både deploy og npm-udgivelse går igennem.

Det er ordret det repoets egen harness-kontrakt forbyder:

> Release-jobbet skal afhænge af test-jobbet så én rød test blokerer deploy/merge. Tests nothing runs are theatre.

## Den værste del er teksten, ikke mekanikken

```
⚠️ Tests with native modules skipped on CI
```

Den læses som en overvejet undtagelse for en kendt begrænsning. Den sluger alt. En ægte regression rapporteres med **samme beroligende tekst** som et miljøproblem nogen engang besluttede at leve med.

Det er dagens gennemgående form igen: **en fejl der bærer formen af noget godartet.** Samme familie som `{ok:true, skipped:true}` i mail, `ok:true` om en ukendt model i ai-sdk, og en chat der svarer som om den ved noget.

## Hvorfor den IKKE bare skal armes — og det er hele pointen med kortet

cms-admin-suiten fejler **ca. 3 gange ud af 30 kørsler** med én fejlende test, og **fejlens navn når aldrig outputtet**: vitest skriver `Tests 1 failed | 1245 passed` uden testnavn og uden assertion.

Observeret:

| Når | Efter |
|---|---|
| 27/8 | ai-sdk 0.31.0-opgradering |
| 28/8 | ai-sdk 0.34.0-opgradering |
| 28/8 | tool-context-commit |

Kunne ikke reproduceres i **19 kørsler i træk** bagefter, heller ikke med tømt vite/vitest-cache. Den første hypotese ("første kørsel efter `pnpm install`") holdt ikke — tredje forekomst kom på anden kørsel.

At et fejlnavn aldrig printes peger på at en **proces dør** frem for at en assertion slår fejl. Det er ikke bevist.

**Armer man porten før det er forstået, blokeres ca. hver tiende deploy tilfældigt.** Og en port man slår fra igen efter en uges falske alarmer er værre end ingen port — den lærer folk at ignorere den.

## Rettelse 28/8 aften — den suite porten skulle armes på, var selv rød

Sætningen ovenfor om at `test.yml` "kører korrekt" var forkert, og det er den halvdel hele kortet hviler på. Målt samme aften: **99 failure og 0 success** af de seneste 100 kørsler. Hver gang er det E2E-jobbet.

Havde porten været armet på den, ville **hvert eneste deploy** være blevet blokeret — ikke ca. hvert tiende som flakeren i F178.2 giver, men alle. Årsagen står i **F178.4** og er nu rettet.

Målt på CI efter rettelsen (`09e0302d`): **7 passed · 21 failed · 15 skipped**, mod 7 · 34 · 2 før. De 21 er ikke skjult — de får navn i **F178.5**, og porten kan først armes derefter.

## Rækkefølgen

1. **Få suiten grøn.** → **F178.4** (porten rettet 28/8 aften) → **F178.5** (de 21 resterende røde skal navngives)
2. **Forstå flakeren.** Den skal kunne navngives før noget armes. → F178.2
3. **Gør fejlen synlig uden at blokere** — fjern den beroligende tekst, så en rød suite ser rød ud i logfilen selv mens den ikke stopper noget. Dette trin er ufarligt og kan tages med det samme. → F178.1
4. **Arm porten** — deploy og publish afhænger af en test-kørsel der faktisk kan fejle. → F178.3

Trin 3 kan tages når som helst. **Trin 4 før trin 1 og 2 er ikke bare uklogt — det stopper alt.**

## Afgrænsning

**Ikke med:** at gøre suiten hurtigere, at flytte tests, at røre selve testene. Kortet handler om porten og om én uforklaret fejl — ikke om testdækning.

## Beslutningen der er Christians

At arme porten ændrer hans arbejdsgang: fra i dag kan et deploy blive stoppet. Det er meningen, men det er hans valg hvornår — især fordi trin 1 kan tage tid, og fordi han deployer ofte.
