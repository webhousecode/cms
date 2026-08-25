# F171 — Serverens fejl er usynlige i Upmetrics

**Status:** backlog · **Fundet:** 25. august 2026, mens en støjende alarm blev undersøgt

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
