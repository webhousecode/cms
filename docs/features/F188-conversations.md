# F188 — Conversations: besøgendes AI-samtaler som eget CMS-modul

## Motivation

Ejerordre 5/9-2026: «Vi skal helt klart have lavet et Samtaler modul i CMS, det skal nu nok hedde Conversations eller bare Chat.»

**Målt før noget blev besluttet** (broberg-ai-site, `src/aidan*.ts`): chathistorikken gemmes **slet ikke**. Der findes ingen skrivning af samtaler nogen steder i koden. Det eneste der lander på disken er:

| Hvad | Hvor | Indhold |
|---|---|---|
| Leads | `/data/aidan-leads.jsonl` | Mail + hvad der blev bedt om, når den besøgende selv beder om det |
| Tommelfingre | `/data/aidan-feedback.jsonl` | 👍/👎 + uddrag ≤160 tegn + sprog + tidspunkt |

Samtalen lever i browserens hukommelse under besøget og er væk bagefter. Ejeren kan altså ikke se hvad folk spørger Aidan om — kun hvad de gav tommel op/ned til.

## Hvorfor ikke bare i Forms (F187)

Første — for løse — svar var «chatten som modul i Form Engine 2.0». Det holder kun for den ene halvdel:

- **Kundeemner HØRER i Forms.** Når Aidan opsamler en mailadresse («send dette svar til mig», transskript-tilbuddet) er det reelt en indsendelse — indsamlet gennem en samtale i stedet for et skema. Den skal i **samme indbakke** som kontaktformularen, mærket med kilden. Ellers er der to steder at holde øje med kundeemner, og det ene bliver glemt.
- **Samtalen HØRER IKKE.** En indsendelse er et sæt felter med værdier; en samtale er ture med roller, tidsstempler og markører. Presses den ned i felt/værdi-modellen bliver den til `besked_1, besked_2, …` — og så kan Forms' egne værktøjer (tragt, gruppering, statistik pr. felt) ikke bruges alligevel. Det ville være at bøje datamodellen for at kunne sige at vi genbrugte den.

**Derfor: eget modul der låner Forms' RAMME** (indbakke-visning, filtre, statistik-komponenter, opbevaringsregler), men har sin egen tabel med ture.

## Navnet

**Conversations**, ikke Chat. `packages/cms-admin/src/components/chat/` er allerede ejerens egen AI-chat med CMS'et (F107, 40 værktøjer). To sidebar-punkter ved navn «Chat» ville betyde hver sin ting for den samme bruger.

## Arkitektur-skitse

- **Datamodel:** `conversations` (id, site, locale, startet, sidst-set, antal-ture, kilde) + `conversation_turns` (rolle, tekst, tidspunkt, markører). Pr. site, som alt andet.
- **Optagelse:** sitet POSTer samtalen til cms-admin ved afslutning (eller løbende pr. tur — afgøres i F188.1). Token-auth som øvrige site→admin-ruter, `?site=` håndteres af proxy (husets regel: site-kontekst opløses i proxy.ts, ikke i ruten).
- **Kobling til Forms:** endte samtalen i et kundeemne, peger samtalen på indsendelsen og indsendelsen tilbage på samtalen. Én linje hver vej — så man kan se hvad der blev sagt, før man svarer et menneske.
- **Statistik:** antal samtaler, ture pr. samtale, frafald, emner, og **ubesvarede spørgsmål** (miss-signalet, jf. F251 hos trail — samme hovedvending sendes til Trail som råstof til nye neuroner).
- **Rettigheder:** nyt permission-streng, gated på ALLE lag (sidebar, server-side page, API-rute, chat-tool) jf. husets hard rule. Spørgsmålet «admin-only eller også editors?» besvares i F188.1.

## Persondata — fristen, og en modsigelse der skal afklares

En chatlog er andres ord om deres egne forretninger: folk skriver firmanavne og hvad de kæmper med.

**Ejeren har sagt to forskellige ting, og den anden gang var min skyld.**

| dato | hans ord | begrundelse |
|---|---|---|
| **5/9-2026** | fritekst ligger **12 måneder** | «der skal være tid til minering» — et mønster i hvad kunder spørger om viser sig over en sæson, ikke over et kvartal. En 90-dages frist ville slette materialet før det kunne læses. |
| **19/9-2026** | «**90 dage** på teksten, tallene for evigt — byg det» | — ingen; det var et svar på et spørgsmål jeg fremstillede som åbent |

**Hvorfor det skete:** jeg læste kortets GEMTE plan-tekst (fra 5/9 kl. 21.05,
før hans beslutning blev skrevet ind i filen) i stedet for filen på disken, og
fortalte ham derfor at fristen stod åben med 90 dage som min anbefaling. Den
anbefaling var allerede forkastet — af ham, med en grund. Han svarede på et
spørgsmål der ikke var åbent.

**Bygget med 90 dage**, fordi det er hans seneste udtrykkelige ord, og fordi
prisen for at tage fejl i dag er nul: der findes ikke én samtale i systemet der
er over et døgn gammel, så ingen tekst slettes af den beslutning før om 90 dage.
Fristen er ÉN konstant — `CONVERSATION_TEXT_RETENTION_DAYS` — så den ændres ét
sted hvis 12 måneder skal gælde.

**Står åbent til han bekræfter hvilken der gælder.** Vælger han 12 måneder igen,
er ændringen ét tal og to prøve-forventninger.

Konsekvenser der skal bygges, ikke bare noteres:
- Fristen er ÉN værdi ét sted i konfigurationen. Gentages den i job, visning og dokumentation, driver de fra hinanden, og den forkerte bliver stående.
- 12 måneder er lang nok til at oplysningspligten er reel: sitet skal kunne oplyse at samtalen gemmes og hvor længe.
- Sletning enkeltvis skal virke uafhængigt af fristen — en person kan bede om det inden de 12 måneder er gået.

## Hvad der KAN genbruges fra den eksisterende chat — og hvad der ikke kan

Ejeren, 5/9: «vi har allerede et kunde vendt Chat modul i CMS der styrer sin helt egen historik.» Målt i koden før datamodellen skrives:

`packages/cms-admin/src/lib/chat/conversation-store.ts` gemmer `StoredConversation { id, userId, title, messages[], createdAt, updatedAt, starred }` som JSON under `{dataDir}/chat-conversations/{userId}/`. `ChatMessage` bærer `{ id, role, content, timestamp, toolCalls? }`.

- **GENBRUGES: formen.** `ChatMessage` dækker præcis det en Aidan-tur er (rolle, tekst, tidsstempel). Vi opfinder ikke en ny tur-type ved siden af.
- **KAN IKKE genbruges: nøglen.** Lageret er inddelt pr. **indlogget bruger** (`userId`), og en Aidan-samtale har ingen bruger — det er en anonym besøgende. Genbrugtes stien direkte, skulle vi opfinde en pseudo-bruger, og så ville de besøgendes samtaler ligge blandt ejerens egne.
- **Konsekvens:** eget lager nøglet på site + samtale-id, med den samme tur-form. Én type, to lagre — ikke to typer.

## Non-goals

- Live-medlæsning / overtagelse af en kørende samtale (senere, hvis nogen efterlyser det).
- Chatten på tværs af sites i én samlet visning — modulet er per-site som resten af CMS'et.
- Ændringer i F187 Form Engine 2.0 ud over den ene kobling begge veje.

## Reuse

Discovery-tjek: intet `@broberg/*`-pakke ejer «gem en AI-samtale». Modulet genbruger CMS'ets egne primitiver (site-pool, permissions-shared, proxy-site-kontekst, Forms' indbakke-komponenter). Miss-signalet genbruger trails F251-kontrakt frem for at bygge en parallel tæller.

---

## F188.1 — leveret (19. september 2026)

**Hvad der findes nu:** et site kan aflevere en færdig samtale til CMS'et, og
den kan læses tilbage — pr. site, som alt andet.

| | |
|---|---|
| Lager | `<dataDir>/conversations/<id>.json`, én fil pr. samtale med turene i sig — samme form som formular-indsendelser (F30) og admin-chatten. Ikke to SQL-tabeller: cms-admin har ingen database pr. site, og en opfundet en ville være det eneste sted i huset. |
| Optagelse | `POST /api/conversations` → 201 |
| Læsning | `GET /api/conversations` (liste, uden ture) · `GET /api/conversations/{id}` (hel samtale) |
| Tenant | `?site=<id>` opløses i `proxy.ts` som alle andre ruter. Ruten læser den ALDRIG selv. |

### Rettigheds-spørgsmålet, besvaret

To rettigheder, ikke én:

- **`conversations.read`** — indbakken. En redaktør har den, af samme grund som
  `forms.read`.
- **`conversations.write`** — optagelses-ruten, som sitets eget token bruger.
  Ingen menneskelig rolle har den ud over admin: en redaktør må læse hvad
  besøgende sagde, men har ikke noget at gøre med at skrive samtaler ind i
  protokollen — en samtale skal jo være et referat.

**En læser (viewer) får INGEN af dem.** Samme afgjorte regel som for
formular-indsendelser: en læser må se det der er UDGIVET, aldrig protokollen
bag — og en chatlog er andres ord om deres egne forretninger.

Begge findes også i token-kataloget (`conversations:read` / `conversations:write`),
så et site-token kan få præcis den ene rettighed det skal bruge.

### Målt, ikke antaget

Kørt mod den kørende admin (`:3010`), med `?site=` mod to forskellige sites:

- POST med 3 ture → 201; en FRISK GET gav nøjagtig de 3 ture i rigtig
  rækkefølge, ordret (danske tegn intakte).
- Samme id på et ANDET site → 404, og filen lå kun i det ene sites `_data`.
- Samtale uden ture → 400, og der blev ikke skrevet en tom skal.
- Ukendt id → 404. Ingen auth → 401.
- `conversations.test.ts` skriver og LÆSER TILBAGE fra lageret.
  Mutations-bevist: fjernes skrivningen går 4 prøver røde, fjernes
  tom-spærren 2, fjernes POST-porten 2.

At en viewer får 403 er bevist mod rolle-tabellen i prøverne, ikke kørt i en
browser med en viewer-session.

### Endnu ikke bygget (F188.2+)

Admin-fladen (sidebar, indbakke-visning), koblingen til Forms' indsendelser
begge veje, statistik/miss-signalet, og opbevaringsgrænsen på fritekst — den
sidste er ejerens beslutning og står stadig åben øverst i dette dokument.

---

## F188.5 — leveret (19. september 2026): teksten udløber, tallene bliver

**Ejerens ord 19/9-2026, ordret: «90 dage på teksten, tallene for evigt — byg
det.»** Se afsnittet «Persondata» ovenfor: han sagde 12 måneder den 5/9 med en
grund, og de 90 dage blev sagt fordi jeg fremstillede spørgsmålet som åbent.
Motoren er bygget med 90; det er ét tal at ændre hvis 12 måneder står ved magt.

| | |
|---|---|
| Hvad der fjernes | kun `turns[].text` |
| Hvad der bliver | antal ture, roller, tidsstempler, markører (lead/miss), sprog, kilde — og samtalen selv |
| Hvornår | 90 dage, målt fra **CMS'ets eget ur** (`createdAt`, da vi modtog samtalen) |
| Hvor tit | hver time; fejningen nægter at køre to gange inden for 20 timer pr. site |
| Hvor | `lib/conversations/retention.ts`, tilsluttet i `instrumentation-node.ts` |
| Straks-sletning | `DELETE /api/conversations/{id}` — egen rettighed `conversations.delete`, kun admin |

### Fire valg der ikke er vilkårlige

1. **Teksten tømmes, samtalen bliver — og den bærer `textRedactedAt`.** Uden det
   stempel er en tømt samtale ikke til at skelne fra en hvor den besøgende
   aldrig sagde noget. Læseren ville drage den forkerte konklusion, og intet i
   dataen ville modsige ham.
2. **Alderen måles på VORES ur, ikke kalderens.** `createdAt` sættes af CMS'et;
   `at` på hver tur kommer fra sitet. Målte vi på det sidste, kunne et site
   sende en tur dateret i 2099 og dermed købe sin samtale et ubegrænset ophold.
   Løftet er vores at holde.
3. **Tallet står ÉT sted.** `CONVERSATION_TEXT_RETENTION_DAYS` bestemmer både
   fejningens grænse og den `textRetentionDays` læse-API'et udleverer — så en
   flade der vil fortælle et menneske hvor længe teksten gemmes, spørger
   serveren i stedet for at skrive 90 selv. En prøve fejler hvis tallet dukker
   op i en anden fil i modulet.
4. **Fejningen har sin EGEN runde, ikke et trin i tools-scheduler.** Den loop
   springer et site over hvis både backup og link-tjek er slået fra — og et site
   der har fravalgt backup har ikke fravalgt et databeskyttelsesløfte. Hullet
   ville have været usynligt: fejningen ville melde succes uden nogensinde at
   have kigget på de sites.

### Målt, ikke antaget

Mod den kørende admin (`:3010`, sitet `landing`) og mod sitets rigtige datamappe:

- Samtale bagdateret 91 dage → fejet → **læst tilbage over HTTP**: begge ture har
  tom tekst, `textRedactedAt` sat, mens `turnCount: 2`, `locale: da`,
  `source: aidan`, begge tidsstempler og markøren `["lead"]` står uændrede.
- De oprindelige ord findes ikke længere i filens bytes.
- `GET /api/conversations` svarer `textRetentionDays: 90`.
- `DELETE` → 200 og derefter 404 ved genlæsning; ukendt id → 404.
- 16 prøver. Mutations-bevist: skrivningen fjernet → 5 røde · grænsen hardkodet
  til 9999 dage → 5 røde · markører tabt ved tømning → 1 rød · fejningens
  kaldested fjernet → 1 rød.

### Udskilt til F188.6 — ikke droppet

To halvdele af det oprindelige kort kræver en skærm der ikke findes endnu:
**sletteknappen på Conversations-fladen** (kræver F188.2) og **løftet til den
besøgende på selve sitet** (andet repo, kræver samtale-widget'en). Serverdelen af
begge ligger klar: ruten svarer, og fristen kan læses fra API'et. F188.6 er
oprettet med egne acceptkriterier og er blokeret af F188.2.
