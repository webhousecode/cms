# Hvad CMS'et kan — oktober 2026

Til fysio.work's modulside «Website». Skrevet til en klinikejer. Målt i koden og på webhouse.app den 22. oktober 2026.

**LIVE** = virker i dag på webhouse.app. **PÅ VEJ** = besluttet, ikke færdigt. **IKKE** = findes ikke, lov det ikke.

## Redigering

| Funktion | Status | Hvad det betyder for klinikken |
|---|---|---|
| Redigér direkte på hjemmesiden | LIVE | Klik på en tekst på jeres egen side, ret den og gem. Kører i dag på sanneandersen.dk og broberg.ai |
| Sider bygget af blokke | LIVE | Tekst, billede, billedgalleri, video, lyd, fil til download, kolonner, formular |
| Links til egne sider der følger med | LIVE | Flytter eller omdøber I en side, retter linkene sig selv |
| Kladder og udgivelse | LIVE | Arbejd på en side uden at den er synlig, udgiv når den er klar |
| Planlagt udgivelse | LIVE | Vælg dato og tid, så går siden live af sig selv |
| Tidligere versioner og papirkurv | LIVE | Fortryd en ændring, hent en slettet side tilbage |
| Indsæt fra Word | LIVE | Tekst kopieret fra Word bliver renset, så den ikke ødelægger sidens udseende |

## Billeder og medier

| Funktion | Status | |
|---|---|---|
| Mediebibliotek | LIVE | Upload, mapper, søgning, omdøbning |
| Automatisk billedoptimering | LIVE | Billeder gøres små og hurtige (WebP) uden at I skal gøre noget |
| AI-beskrivelse af billeder | LIVE | Alt-tekst til skærmlæsere og Google foreslås automatisk |

## Sprog

| Funktion | Status | |
|---|---|---|
| Flere sprog | LIVE | Hver side kan findes på flere sprog, koblet sammen |
| AI-oversættelse | LIVE | Oversæt en side med ét klik, ret bagefter |

## Synlighed på Google og i AI-søgning

| Funktion | Status | |
|---|---|---|
| SEO-titler og beskrivelser pr. side | LIVE | |
| SEO-tjek med 13 regler + AI-forbedring | LIVE | Viser hvad der mangler og kan foreslå bedre titler og tekster |
| Sitemap og robots.txt | LIVE | Laves automatisk når hjemmesiden bygges på CMS'ets standardopsætning |
| llms.txt (til ChatGPT, Claude m.fl.) | LIVE | Laves automatisk, når hjemmesiden er bygget på CMS'ets standardopsætning, så AI-søgning kan læse klinikkens indhold |
| Strukturerede data (JSON-LD) | LIVE | Google forstår hvad siden handler om |
| Link-tjek | LIVE | Finder døde links på siden |
| Hastighedsmåling (Lighthouse) | LIVE | Måler hvor hurtig siden er |

## Formularer og kontakt

| Funktion | Status | |
|---|---|---|
| Kontaktformularer | LIVE | Byg formularen selv, svar lander i en indbakke i CMS'et |
| Automatisk svarmail | LIVE | Den der skriver får en bekræftelse |
| Spamværn | LIVE | |

## Booking

| Funktion | Status | |
|---|---|---|
| Indlejring af eksisterende bookingsystem | DELVIS | Kan indsættes som indlejret element. Der er **ingen færdig bookingblok** — lov ikke «booking i CMS'et» |

## Blog og nyheder

| Funktion | Status | |
|---|---|---|
| Nyheder / blog med kategorier | LIVE | Opsættes som en samling på sitet |
| Podcast | LIVE | Findes, men næppe relevant for en klinik |

## AI-hjælp

| Funktion | Status | |
|---|---|---|
| AI-skrivehjælp i editoren | LIVE | Omskriv, forkort, ret sprog |
| Korrekturlæsning | LIVE | Stavefejl og grammatik markeres i teksten |
| AI-chat om sitets indhold | LIVE | |
| Al AI kører i EU | LIVE | Mistral i Paris. Ingen persondata til USA |

## Brugere og adgang

| Funktion | Status | |
|---|---|---|
| Roller: administrator, redaktør, læser | LIVE | Læsere kan ikke se formular-svar eller slettet indhold |
| Login med BID | LIVE | Ét login for hele platformen |
| Mobil-app til CMS'et | IKKE | Bygget, men ikke i App Store |

## Drift, sikkerhed og GDPR

| Funktion | Status | |
|---|---|---|
| CMS'et kører i EU (Stockholm) | LIVE | |
| Backup | LIVE | Automatisk backup af indhold |
| Backup uden for hostingleverandøren | PÅ VEJ | Ikke bygget endnu |
| Underdatabehandlere vist offentligt | LIVE | broberg.ai/trust |
| Besøgsstatistik uden cookies | IKKE BEKRÆFTET | Kører på webhouse.app selv. Om den følger med kundens hjemmeside er ikke målt — lov det ikke endnu |

## Domæne, SSL og hosting

| Funktion | Status | |
|---|---|---|
| CMS'et under eget navn på cms.fysio.work | PÅ VEJ | White-label er besluttet og i gang. Adressen svarer ikke endnu |
| Hosting af selve hjemmesiden | IKKE i CMS'et | CMS'et redigerer indholdet. Hjemmesiden bygges og hostes for sig selv, og CMS'et giver besked når den skal bygges om |
| SSL | LIVE | Med hosting af hjemmesiden følger SSL. CMS'et selv kører på HTTPS |

## Hvornår svarer cms.fysio.work?

**Der er ingen dato endnu.** Det kræver tre ting, i den rækkefølge:
1. CMS'et skal kunne skifte navn, logo og farver efter adressen. Arbejdet starter nu.
2. DNS-posten cms.fysio.work oprettes (gennem buddy).
3. Login fra fysio.work skal føre direkte videre til CMS'et uden nyt login.

fysio.work får besked i samme øjeblik adressen virker.

---

# Tilføjelse: AI-agenterne og den dybe integration (22/10)

Christians ramme: *et AI-native enterprise CMS, hvor AI-agenter stort set kan bygge indholdet løbende.* Målt i koden samme dag. Samme mærker: **LIVE · PÅ VEJ · IKKE**.

## AI-agenter der arbejder for klinikken

| Funktion | Status | Hvad det betyder |
|---|---|---|
| Faste agenter: tekstforfatter, SEO-optimering, GEO-optimering (synlighed i AI-søgning), oversætter, indholds-opfrisker | LIVE | Hver agent har sin opgave og kan sættes til at arbejde på klinikkens indhold |
| Egne agenter med egen opgavebeskrivelse | LIVE | Klinikken kan få en agent der fx skriver om nye hold hver uge |
| Agenter der kører af sig selv efter plan (dagligt/ugentligt, tidspunkt, antal pr. kørsel) | LIVE | Indholdet holdes friskt uden at nogen skal huske det |
| Godkendelse før udgivelse | LIVE | Alt agenterne laver lander i en godkendelseskø. Intet går live uden et menneskes ja |
| Budgetloft pr. agent (dag/uge/måned) | LIVE | AI-forbruget kan ikke løbe løbsk |
| AI-assistent i CMS'et der kan udføre handlinger (oprette, rette, oversætte, SEO-tjekke) | LIVE | Over 60 værktøjer. Skriv hvad du vil have gjort, og den gør det — med samme rettigheder som brugeren |
| MCP-adgang: eksterne AI-værktøjer (fx Claude) kan arbejde i CMS'et med nøgle | LIVE | 38 værktøjer med adgangsnøgle + en offentlig læse-adgang til udgivet indhold |
| Agenter der selv bestiller illustrationer til nye artikler | PÅ VEJ | |
| Alle AI-modeller kører i EU (Mistral, Paris) | LIVE | Ingen klinikdata til USA |

## Integration med fysio.work-platformen

| Funktion | Status | Hvad det betyder |
|---|---|---|
| Indholds-API med adgangsnøgler begrænset til ét site og bestemte rettigheder | LIVE | fysio.work kan læse og skrive klinikkens indhold maskinelt |
| Strukturerede data på sitet (behandlere, ydelser, priser, hold, åbningstider) | LIVE | Opsættes som samlinger med egne felter, redigerbare i CMS'et |
| …holdt automatisk opdateret fra bookingsystemet | DELVIS | Virker ved at **fysio.work skubber** data ind via API'et, når de ændres. CMS'et har **ingen indbygget forbindelse** der selv henter fra et bookingsystem — det er integrationsarbejde pr. platform |
| Udgående webhooks ved ændringer (indhold, agenter, udgivelse, medier) | LIVE | fysio.work kan få besked i samme øjeblik noget ændres |
| «Byg nu» — sitet bygges om automatisk når indhold udgives | LIVE | Ændringer når ud på hjemmesiden uden manuelt arbejde |
| Fælles login med BID | LIVE | Samme login som resten af platformen |
| Gå direkte fra fysio.work til CMS'et uden nyt login | PÅ VEJ | Del af white-label (cms.fysio.work) |
| Indlejring af moduler (booking, patientassistent) | DELVIS | Kan indlejres som interaktive elementer på siderne. Ingen færdige blokke til netop booking eller patientassistent |
| AI-chat for besøgende på hjemmesiden | LIVE andre steder | Kører i dag på broberg.ai (samtaler gemmes 90 dage). Ikke sat op til klinik-sites endnu |

## Hvad det betyder samlet

Dybden ligger i, at platform og hjemmeside taler sammen via API, webhooks og ét login: fysio.work kan holde klinikkens data ajour på sitet, og agenterne kan løbende skrive, oversætte og optimere — altid med en klinikmedarbejders godkendelse før det går live. Det der **ikke** findes færdigt i dag er en indbygget forbindelse direkte til et bookingsystem og færdige booking-/assistent-blokke; det skal bygges som en del af integrationen.
