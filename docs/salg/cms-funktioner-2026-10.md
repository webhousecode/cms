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
