# F183 — Link-tjek melder levende sider døde

## Hvordan det kom frem

Christian, 2026-09-02, mens jeg havde bygget et engangs-script til at finde adresser uden skema:

> «Kør scanning på sanne også - men du har jo i cms et tool til den slags. Det hedder broken links eller lign.»

Han havde ret på begge punkter. Værktøjet findes (`/admin/link-checker`), og mit script var en dublet. Så jeg kørte det rigtige værktøj på sanneandersen — og verificerede hvert fund udefra før jeg videresendte det.

## Målt: 121 links, 37 meldt som fejl, **17 af dem falske**

| Klasse | Antal | Meldt | Målt mod sanneandersen.dk |
|---|---:|---|---|
| `mailto:` | 9 | `error: fetch failed` | en mailadresse kan ikke hentes |
| interne sider | 6 | `No matching document found` | **200** × 4, **307** × 2 — alle live |
| `kpo.naevneneshus.dk` | 2 | `broken` | HEAD 404, **GET-med-redirect 200** |
| **falske i alt** | **17** | | |
| manglende billeder | 18 | `broken` | **404** — ægte |
| `ec.europa.eu/odr` | 2 | `broken` | **404** på både HEAD og GET — ægte |

Billed-fundene blev kontrolleret mod samme sti-form: `/uploads/hero/sanne-hero.webp` → 200, `/uploads/team/sanne.webp` → 404. Uden den sammenligning beviste de seks 404'ere ingenting.

## Hvorfor det er værre end støj

**Et værktøj hvor knap halvdelen af advarslerne er falske, holder man op med at læse.** Og så bliver `ec.europa.eu/odr` — et dødt link i en **juridisk henvisning** i handelsbetingelserne — usynligt blandt de forkerte. Falske positiver koster ikke bare tid; de slår detektoren fra.

## De fire fejl

### 1. `mailto:` og `tel:` hentes

`processOne` afgør med `raw.url.startsWith("/")`. Alt andet er «eksternt» og går i `checkExternal`, som `fetch`er det. `fetch("mailto:…")` fejler. Ni advarsler fra fire dokumenter, alle på en korrekt mailadresse.

### 2. Kun HEAD, og en 404 fra HEAD tros

`checkExternal` prøver HEAD og falder tilbage til GET **kun når kaldet kaster** — ikke når det svarer 404. En vært der afviser HEAD (almindeligt bag WAF) meldes død.

### 3. Den interne liste er UDLEDT, ikke spurgt

`internalMap` bygges af CMS-dokumenter. Sitets **statiske ruter** findes ikke i den, så en levende side meldes død.

Samme fejlklasse som sanneandersens egen F054.1 (`llms.txt` byggede sin egen liste og fik 47 af 130 sider med) og som F164.5, hvor løsningen allerede er fundet: **spørg sitet.** En udledt liste er ikke delvist forkert — den er ufuldstændig, og man kan ikke se hvor meget.

### 4. En adresse uden skema får en parse-fejl

`www.trailmem.com` → `error: "Failed to parse URL from www.trailmem.com"`. Fejlen FANGES altså — men i samme bunke som timeouts, og på udviklersprog. En redaktør kan hverken se hvad der er galt eller hvad hun skal gøre.

## Reuse

Discovery-tjek (`discovery.broberg.ai/api/search`): `link url sanitize href` → `@broberg/secret-scan` (hemmeligheds-redaktion, ikke adresser); `url normalisering scheme` → `@broberg/media` (signerede upload-URL'er). **Ingen `@broberg/*`-pakke ejer link-validering.**

**Genbrug INDEN for huset, og det er hele pointen med dette kort:** klassifikationen af en tvivlsom adresse findes allerede som `isSchemeless` i `@broberg/cms-inline-edit` (F164.6), eksporteret fra pakkens indgang netop for at kunne deles. Link-tjekket skal bruge DEN frem for at få sin egen — to regler for samme spørgsmål ender med at være uenige, og så melder værktøjet et rent site som editoren stadig producerer døde links på.

Samme argument for sti-listen: **F164.5** løste allerede «hvilke sider findes på sitet» ved at spørge sitemappet. Link-tjekket skal ind på den samme kilde, ikke bygge en tredje.

## Uden for opgaven

- At rette Sannes indhold. De 18 manglende billeder og ODR-linket er sanneandersen-sessionens kald; de har fået fundene med måledata.
- At gøre Link-tjek multi-site. Det kører på det aktive site; `scan-schemeless-links.mjs` dækker alle sites i én kørsel, og den forskel skal stå skrevet frem frem for at være en tavs dublet.
