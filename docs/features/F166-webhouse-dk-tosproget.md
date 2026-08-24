# F166 — webhouse.dk tosproget: dansk udgave af hver side og komponent

> Christian, 24. august 2026: *"Sitet https://wh-site.webhouse.net/ skal oversættes til Dansk så der både er en Engelsk og Dansk udgave af ALLE sider og ALLE komponenter — du skal lave siderne i CMS som siamesiske tvillinger så de hænger sammen."*

## Hvad der allerede er sandt (målt, ikke antaget)

Alt herunder er aflæst på produktion (`site=webhouse-site`) før noget blev ændret.

### Sproget er allerede besluttet i konfigurationen

```
locales        = ["da", "en"]
defaultLocale  = "en"
localeStrategy = "prefix-other"
```

`prefix-other` betyder: **standardsproget står uden præfiks, de andre får et.** Engelsk bliver altså på `/about`, dansk lander på `/da/about`. Der er ingen URL-beslutning at træffe — den er truffet, og at ændre den ville flytte hver eneste eksisterende engelsk adresse og koste sitets placering i søgemaskinerne.

> **En rettelse værd at skrive ned.** Mit første opslag gik mod `/api/schema`, som svarede `locales: None`. Det tog jeg et øjeblik for et svar om sitet. Endepunktet returnerer kun `collections` — jeg havde målt mit eget spørgsmål, ikke sitets tilstand. Admin-headeren viste `DA · EN` hele tiden. Et tomt svar fra det forkerte endepunkt ligner et negativt svar til forveksling.

### Indholdet: 63 dokumenter, nul tvillinger

| Collection | Dokumenter | | Collection | Dokumenter |
|---|---:|---|---|---:|
| `posts` | 24 | | `services` | 5 |
| `pages` | 7 | | `blocks` | 5 |
| `timeline` | 7 | | `team` | 2 |
| `work` | 6 | | `globals` | 1 |
| `clients` | 6 | | **I alt** | **63** |

**Ingen af dem har en `translationGroup`.** Der findes intet tvillingepar på sitet i dag. To ting mere, som skal ryddes før tvillingerne laves:

- **6 posts har slet ingen `locale`** (`cms-chronicle-00`, `-10`, `-11`, `-12`, `-13`, `mcp-and-agentic-cms…` m.fl.). Et dokument uden sprog kan ikke tvillinges — der er ikke noget at være tvilling *til*.
- **Ét løst dansk indlæg findes allerede**: `posts/demo-da` (`locale=da`, ingen tvilling). Det skal enten kobles til sin engelske pendant eller erklæres selvstændigt — ikke efterlades som en forældreløs.

### Tvillinge-mønsteret er afskrevet, ikke opfundet

sanneandersen.dk kører tosproget i produktion. Sådan ser et par ud dér:

```
slug=home     locale=da  translationGroup=233c7bcfd9057c65
slug=home-en  locale=en  translationGroup=233c7bcfd9057c65
```

Samme `translationGroup` på begge, og suffiks på slug'en for det sprog der ikke er standard. På webhouse er standarden engelsk, så det vender om:

```
slug=about     locale=en  translationGroup=<ny>
slug=about-da  locale=da  translationGroup=<samme>
```

`translationGroup` **er** den siamesiske tråd. Den er grunden til at admin kan vise sprogfiltret, at en oversættelse ikke laves to gange, og at de to sider kan pege på hinanden.

## Det fund der ændrer opgavens form

**Sitet har ingen danske ruter.**

```
https://wh-site.webhouse.net/da/about  →  404
```

Next.js-appen i `/Users/cb/Apps/webhouse/webhouse-site` har flade ruter — `/about`, `/blog`, `/work` — uden sprogsegment. Der er intet `[lang]`, ingen sprogvælger, og `src/lib/cms.ts` er det eneste sted ordet *locale* overhovedet optræder.

Konsekvensen, sagt rent: **danske tvillinger i CMS er usynlige for besøgende indtil frontenden får sprog-routing.** Opgaven er to halvdele i to repoer. CMS-halvdelen er den Christian beskrev og er en forudsætning for den anden; frontend-halvdelen er den der gør sitet tosproget for et menneske.

## Udgivelsesvejen er i stykker — og det blokerer alt

```
deployProvider       = "flyio-live"    ← bygger STATISK output
deployFlyLiveAppName = "webhouse-app"  ← CMS-adminens EGEN app
deployAppName        = "webhouse-dk"   ← denne er rigtig
```

wh-site er en Next.js/SSR-app. `flyio-live` bygger statiske filer og synkroniserer dem til en volumen — derfor fejlbeskeden Christian så: *"Fly.io Live requires a build.ts or a build.command in cms.config.ts."* Providerens egen fejltekst peger på det rigtige: SSR-apps skal bruge `flyio` (rebuild).

Det andet er værre og var ikke rapporteret af nogen: `deployFlyLiveAppName` peger på **`webhouse-app`**, som er CMS-adminen selv. Var flyio-live nogensinde kommet forbi build-tjekket, ville den have synkroniseret sitets indhold ind på adminens egen volumen. Fejlen der blokerede den, skjulte en værre fejl bagved.

Uden en virkende udgivelsesvej når 63 nye danske dokumenter aldrig længere end til CMS-databasen.

## Arkitektur

```
  [1] Udgivelsesvej      deployProvider → flyio, ryd den forkerte app-reference
         ↓
  [2] Sproghygiejne      6 posts uden locale får en; demo-da afklares
         ↓
  [3] 63 tvillinger      AI-oversættelse (EU/Mistral) → dansk twin + fælles translationGroup
         ↓
  [4] Frontend           [lang]-segment + sprogvælger i webhouse-site (andet repo)
```

Rækkefølgen er ikke til forhandling: [2] før [3], fordi et dokument uden sprog ikke kan tvillinges, og [1] før alt, fordi en levering man ikke kan verificere er en levering man ikke har lavet.

## Non-goals

- **Ingen ændring af engelske adresser.** `prefix-other` er valgt; `/about` bliver liggende. At præfikse begge sprog ville flytte hver eneste indekserede side.
- **Ingen nyskrivning af det engelske indhold.** Kilden røres ikke ud over `locale` og `translationGroup`.
- **Ingen tredje sprog.** `locales` er `["da","en"]` og udvides ikke her.
- **Ingen oversættelse af interne felter** (slugs på tværs af referencer, farve-tokens, ikon-navne, felter der bærer kode).

## Den regel der vejer tungest

**Oversættelse må aldrig digte.** Kun det der står i den engelske kilde, sagt på dansk. Ingen nye påstande, ingen opfundne kundenavne, ingen pyntede tal. Præcedensen er F043 på sanneandersen, hvor syv opdigtede kundeudtalelser stod `published` på en rigtig virksomheds side — og webhouse-sitet er fuldt af netop den slags indhold der frister en model til at pynte: casestudier med rigtige kunder (COWI, Ole Lynggaard, Wrist Ship Supply), et årstal-baseret firmaportræt, en tidslinje.

## Rollout

1. Backup af `webhouse-site` køres og **verificeres** (arkiv hentet, antal stemmer) før den første skrivning.
2. Udgivelsesvejen rettes og bevises med ét enkelt dokument, ikke med 63.
3. Tvillingerne laves collection for collection, mindste først (`globals`, `team`), så fejl opdages på 1-2 dokumenter frem for på 24.
4. Danske sider udgives først når frontenden kan vise dem — ellers står de som `published` uden en adresse at bo på.
