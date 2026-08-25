# F171 — Serverens fejl er usynlige i Upmetrics

**Status:** F171.1 udført og bevist på produktionen 25/8 · F171.2 udestår

## Hvad der er galt

`@upmetrics/sdk` initialiseres ét sted i hele repoet:

```
src/components/upmetrics-provider.tsx:14   init({ dsn, environment, release: "cms-admin" })
```

Det er en klient-komponent. Den kører i **browseren** og kun dér.

Konsekvensen er at cms-admin i dag rapporterer fejl fra editorernes browsere — og **ingenting** fra serveren. Hver eneste fejl i en `/api/*`-rute, hver ubehandlet afvisning i en planlagt opgave, hvert crash i en server-komponent: usynligt. Ikke «grupperet forkert» eller «lav prioritet» — det når aldrig frem.

## Hvordan det blev fundet

Ved at forfølge et støjende issue, ikke ved at lede efter det. «TimeoutError: signal timed out» fyrede 3 minutter og 3 sekunder efter en opstart, og vores planlægger vågner præcis på boot+3min (`instrumentation-node.ts:180`) — så jeg skrev til upmetrics at det formentlig var vores egen maskine der kaldte sig selv ud gennem Fly-proxyen.

Det var forkert, og det er pointen. Da jeg gik efter hvor SDK'et overhovedet initialiseres, var svaret «kun i browseren» — så fejlen KAN ikke være kommet fra planlæggeren. Sammenfaldet var tilfældigt. Havde jeg ikke tjekket, havde vi rettet noget der ikke var i stykker, og gapet var stadig åbent.

Upmetrics kunne heller ikke afgøre det: eventet har `stacktrace: { frames: [] }`. Uden en stak grupperes hver stakløs TimeoutError under samme nøgle (`TimeoutError|`), så de 18 hændelser på 86 dage kan være 18 forskellige steder.

## Hvorfor det betyder noget

Christian ser Upmetrics-alarmer på sin telefon. Et dashboard der kun ser browser-fejl **ligner** dækning. Går en gemme-rute i stykker, en planlagt sikkerhedskopi, en udsendelse — så er der ingen alarm, og den eneste der opdager det er den kunde det går ud over.

## Retning (ikke låst)

- Initialisér SDK'et i `instrumentation-node.ts` ved siden af de øvrige boot-opgaver, med samme DSN og `release` sat til git-sha'en (så en fejl kan spores til en udgivelse, som deploy-observe allerede gør).
- Klient og server skal kunne skelnes på en tag, ellers samler de to halvdele sig i ét uigennemskueligt tal.
- Kontrollér begge veje: fremtving en fejl i en API-rute og se den lande; fremtving en i browseren og se den lande. En halv opsætning der kun er afprøvet fra den ene side er præcis den situation dette kort findes for.

## Bemærket undervejs, ikke en del af dette kort

`tools-scheduler.ts` bruger `process.env.NEXTAUTH_URL` som base for sine egne HTTP-kald, altså `https://webhouse.app`. Maskinen kalder sig selv ud gennem den offentlige adresse og Fly-proxyen i stedet for over localhost. Samme mønster står i `curation.ts`, `brand-voice.ts`, `quick-prewarm.ts`, `agent-runner.ts` og `chat/tools.ts`. Det var ikke årsagen til noget her — det er ikke undersøgt, kun set.

---

## Udført 25. august 2026 (F171.1)

To døre, og den anden var ikke oplagt.

**1. `init()` ved boot**, som allerførste handling i `startSchedulers()`. SDK'et installerer process-niveau-håndtering af `unhandledRejection` og `uncaughtException` dér — det er den der fanger en planlægger der sprænger i baggrunden.

**2. `onRequestError` i `instrumentation.ts`.** En fejl kastet inde i en rute-handler fanger Next SELV og laver om til en 500; den når aldrig `uncaughtException`.

`release` er git-sha'en, ikke en konstant. Query-strengen fjernes før afsendelse — den bærer `?site=` og på inline-edit-ruterne et token.

### Og så gav beviset nul

Med begge døre på plads fremtvang jeg en 500 på produktionen og ventede. **Nul events.** Ikke fordi rapporteringen var slukket — boot-loggen sagde `[upmetrics] server-side error reporting ON`.

`onRequestError` ser kun en fejl **Next selv fanger**, altså et ubehandlet kast. Dem har denne kodebase næsten ingen af: **137 steder i 108 filer** fanger deres egen fejl og svarer `{error:"Internal error"}` med status 500. Det er nøjagtig de fejl der betyder noget — et gem der dør, en upload der forsvinder — og hverken Next's krog eller SDK'ets process-handlers kan se én eneste af dem.

Så «server-rapportering er slået til» ville have været **sandt og blindt på samme tid**. Samme form som resten af dagen: noget der ser dækkende ud, hvor kun én akse måles.

`serverError(err, ctx, init)` rapporterer og svarer 500 i samme handling, så de to ikke kan komme fra hinanden, og bevarer kalderens headers — taber fejlvejen CORS-headeren, brækker et browser-gem præcis når man har mest brug for at se hvad der skete.

### Bevist, ikke antaget

```
GET /api/cms/finder-ikke-denne/slug?site=webhouse-site   → 500
~10 sekunder senere i Upmetrics:
  «Error: Collection "finder-ikke-denne" not found in config»
```

Bekræftet af upmetrics direkte i deres prod-base (event `5c0441523fae4d45…`):

| krav | målt |
|---|---|
| ikke-tom stack | **20 frames**, øverste `as.getCollection @ packages_cms_dist_index…:147:4628` |
| release = sha | `c023cc1ea24b894dbc5b557dbf969fe34ae651e7` |
| runtime-tag | `{"runtime":"server"}` |

Issuet var fremtvunget med vilje og er lukket igen.

### Hvad der står tilbage

De øvrige 134 catch-og-svar-500-steder — **F171.2**.
