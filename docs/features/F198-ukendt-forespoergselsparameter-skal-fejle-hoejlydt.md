# F198 — En ukendt forespørgselsparameter skal fejle højlydt

**Status:** planlagt
**Ejer:** cms-admin (API-kontrakt)
**Opstået:** 18. september 2026, ud af sanne-sessionens fejlsøgning (#28880 / #28881)

## Motivation

En anden session brugte en arbejdsdag på at fejlsøge det de meldte som en datafejl:
de skrev til det engelske dokument med

```
PATCH /api/cms/sider-content/udtalelser?site=sanneandersen&locale=en
```

fik **200**, og læste bagefter det **danske** dokument tilbage. Konklusionen lå lige
for: `?locale=` skriver i det forkerte sprog, altså er data korrupte.

**Målt, og det var ikke det der skete.** Ruten
`packages/cms-admin/src/app/api/cms/[collection]/[slug]/route.ts` læser præcis to
parametre — `site` (l. 37) og `permanent` (l. 501) — og slår dokumentet op med
`cms.content.findBySlug(collection, slug)`, der ikke bærer en locale nogen steder
ned gennem laget (`storage/types.ts:118`). De to dokumenter har hvert sit id og hver
sin slug (`udtalelser` / `udtalelser-en`). De bad om det danske og fik det danske.
Intet blev overskrevet, og der var intet at rydde op.

**Fejlen er stadig ægte.** `?locale=en`, `?locale=klingon` og en stavefejl giver
alle det samme svar, og svaret ser rigtigt ud. Det er husets gennemgående fejlform
— *den grønne retning er den tavse retning* — flyttet fra kroppen til adressen.

### Det der gør det værre end en almindelig tavs parameter

`?locale=` er **ikke** et opdigtet navn. Det er en rigtig parameter i samme API:

```
packages/cms-admin/src/app/api/cms/brand-voice/route.ts:11
  const locale = searchParams.get("locale");
```

Samme præfiks, samme navn, betyder noget ét sted og ingenting et andet — og der er
intet signal om hvilket af de to man står i. En kalder der har lært navnet på den
ene rute, bruger det rimeligt på den anden og får et pænt svar.

### Omfanget, målt (18/9-2026)

| | |
|---|---|
| `route.ts`-filer under `src/app/api/` | 274 |
| af dem der overhovedet læser `searchParams` | 72 |
| distinkte parameternavne i brug | ~40 (`orgId` 19 · `siteId` 18 · `site` 14 · `q` 8 · `path` 6 · `limit` 6 …) |

Ingen af dem afviser noget de ikke kender.

## Scope

**I scope:**

- En lille delt hjælper: en rute **erklærer** de query-parametre den accepterer, og
  et kald med en parameter uden for listen får **400** med parameterens navn og de
  accepterede navne i kroppen.
- Ibrugtagning på indholds-ruterne under `/api/cms/` først — dokument-ruten
  (`[collection]/[slug]`) og collection-ruten. Det er dem fremmede sessioner og
  token-kaldere rammer, og det er dem hvor et forkert svar ligner et rigtigt.
- En forseglende test, mutations-bevist.

**Non-goals (bevidst):**

- **Ikke alle 274 ruter på én gang.** En global afvisning ville ramme kaldere vi
  ikke kender fra ruter der ikke har haft problemet. Udbredelsen sker rutegruppe
  for rutegruppe, og hver af dem er sin egen lille beslutning.
- **Ikke at få `?locale=` til at virke.** Slug'en ER identiteten. To måder at udpege
  samme dokument på er en dublet der driver fra hinanden — det er en ny fejlklasse,
  ikke en rettelse af denne.
- **Ikke ukendte felter i request-KROPPEN.** Zod `.strip()` dropper dem lige så
  tavst, og det er samme fejlform — men det er et andet lag, en anden blast radius
  og sin egen opgave. Den står allerede navngivet i `CLAUDE.md` under gem-felt-reglen.

## Arkitektur-skitse

```ts
// lib/query-contract.ts
export function rejectUnknownParams(
  req: NextRequest,
  accepted: readonly string[],
): NextResponse | null;
```

- Kaldes som det første i handleren, ved siden af den eksisterende rolle-check.
- Returnerer `null` når alt er kendt, ellers en 400 hvis krop navngiver den ukendte
  parameter OG lister `accepted`. Beskeden er hele pointen: den skal gøre en
  fejlsøgning på en time til én linje.
- `accepted` står i samme fil som handleren, som en `const` ved siden af den —
  ikke i en central tabel et andet sted. En ny parameter skal kun kunne tilføjes
  ved at erklære den.

**Vurder ved ibrugtagning:** parametre som platformen selv hænger på (fx en
cache-buster fra en klient). Findes der sådan en på de valgte ruter, erklæres den
eksplicit frem for at bygge en generel undtagelse — en undtagelsesliste er det sted
hvor tavsheden kommer tilbage.

## Hvordan det bevises

En 200 beviser ikke noget her — det var jo præcis en 200 der vildledte.

1. **Negativ kontrol:** `?locale=en` mod dokument-ruten → 400, og svaret indeholder
   strengen `locale`.
2. **Positiv kontrol:** samme kald uden `?locale=` → 200, og den slug der kommer
   tilbage, sammenlignes med **streng lighed** mod den der blev bedt om.
3. **De eksisterende parametre:** `?site=` og `?permanent=` virker uændret.
4. **Mutationsbevis:** fjern vagten → testen skal gå rød. En test der er grøn i
   begge tilstande måler ingenting.

## Reuse

Søgt på Discovery (`/api/search?q=query parameter validation`, 18/9-2026): der er
**ingen `@broberg/*`-pakke der ejer HTTP-query-validering**. Nærmeste træf er
`@broberg/db-sdk` (database-forespørgsler — et andet «query») og
`@broberg/fleet-contracts` (zod-skemaer for flåde-kommunikationens endpoints, ikke
for vilkårlige ruters query-streng). Ingen af dem dækker dette.

`zod` er allerede afhængighed begge steder (`cms` ^3.24.1, `cms-admin` ^3.25.76), så
valideringen kræver ingen ny pakke.

**Beslutning: byg lokalt, og hold det lille.** Hjælperen er ~20 linjer og hænger
sammen med Next' `NextRequest` og husets svarformat. En delt npm-pakke for det ville
være en abstraktion for ét brug — og vi har ikke tre repoer med samme behov i dag.
Bliver det tre, hører den hjemme hos `components`.

## Forudsætninger

Ingen. Ruterne og `zod` findes allerede; ændringen er additiv indtil den første 400
lander, og den lander kun på de ruter vi tager i brug.

## Historier

- **F198.1** — hjælperen + ibrugtagning på dokument-ruten, med den forseglende test.
