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
| `test.yml` | 61, 67 | kører korrekt — men **intet afhænger af den** |

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

## Rækkefølgen

1. **Forstå flakeren.** Den skal kunne navngives før noget armes.
2. **Gør fejlen synlig uden at blokere** — fjern den beroligende tekst, så en rød suite ser rød ud i logfilen selv mens den ikke stopper noget. Dette trin er ufarligt og kan tages med det samme.
3. **Arm porten** — deploy og publish afhænger af en test-kørsel der faktisk kan fejle.

Trin 2 før trin 1 er fint. Trin 3 før trin 1 er ikke.

## Afgrænsning

**Ikke med:** at gøre suiten hurtigere, at flytte tests, at røre selve testene. Kortet handler om porten og om én uforklaret fejl — ikke om testdækning.

## Beslutningen der er Christians

At arme porten ændrer hans arbejdsgang: fra i dag kan et deploy blive stoppet. Det er meningen, men det er hans valg hvornår — især fordi trin 1 kan tage tid, og fordi han deployer ofte.
