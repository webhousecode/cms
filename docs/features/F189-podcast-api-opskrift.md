# Podcast-API'et — opskrift for et site der bygger sit eget panel

Alt herunder er **kørt** mod en rigtig server 7. september 2026, med Bearer-token
og nul cookies. HTTP-statuskoderne er de målte, ikke de forventede.

Formålet er ejerens: *«et komplet API da jeg vil have et kommende Admin panel bag
ved et login i selve det site der anvender CMS.»* Du skal kunne bygge det panel
uden at læse cms' kode.

---

## 0. Forudsætninger

**Sitet skal erklære en `podcast`-samling** i sin `cms.config.ts`. Motoren
opretter den ikke selv — en ugyldig config tager hele sitet ned, og vejen tilbage
går gennem den samme config. Mangler den, svarer hvert kald med en besked der
siger nøjagtig hvad der mangler.

Felterne:

| felt | type | |
|---|---|---|
| `saeson` | number | hvilken sæson. 24 afsnit om året er udgangspunktet |
| `nummer` | number | pladsen i sæsonen, 1-24 |
| `titel` | text | fra artiklen, eller din egen |
| `artikelSlug` | text | sporet tilbage til kilden |
| `tilstand` | select | `kladde` · `manuskript-klar` · `godkendt` · `indspillet` · `udgivet` |
| `replikker` | array | `{ speaker: aidan\|airina, text }` |
| `stemmer` | object | `{ aidan, airina }` |
| `lydUrl` · `lydNoegle` | audio · text | sættes ved indspilning |
| `faktiskPrisUsd` | number | hvad det FAKTISK kostede |
| `udgivetAt` | date | |

**Nøgler.** Manuskriptet kræver en Mistral-nøgle, indspilningen en
ElevenLabs-nøgle. Begge sættes pr. site under AI-indstillinger
(`mistralApiKey`, `elevenlabsApiKey`) — så hvert site betaler sin egen lyd.

---

## 1. Tokenet

Panelet har sit **eget login**. Når din bruger er logget ind hos dig, kalder du
CMS'et med et cms-bruger-JWT som `Authorization: Bearer <token>`.

```
Authorization: Bearer <jwt>
```

Ingen cookies. Tokenets `sub` skal være en bruger der har en medlemsrække på
sitet — ellers er der ingen rolle at slå op, og svaret er 403, ikke 401. Det er
med vilje: en gyldig underskrift er ikke det samme som et medlemskab.

**CORS** reflekterer sitets egen `previewSiteUrl`. Målt: `evil.example` og
`webhouse.dk` får ingen `access-control-allow-origin`; sitets egen adresse får
den.

**Tilladelser** — tre, og den tredje er sin egen fordi den bruger penge:

| | `podcast.read` | `podcast.edit` | `podcast.record` |
|---|---|---|---|
| viewer | – | – | – |
| editor | ✓ | ✓ | – |
| admin | ✓ | ✓ | ✓ |

Målt rolle-matrix (læs / skriv / indspil): viewer `403 403 403` · editor
`200 409 403` · admin `200 409 409`. En redaktør kan altså rette og godkende,
men **når ikke indspilningen**.

---

## 2. Forløbet

Sæt `TOK`, `BASE` og `SITE` først. `?site=<id>` er hvordan du peger på din lejer.

```bash
TOK="<dit jwt>"; BASE="https://webhouse.app"; SITE="site=dit-site-id"
A=(-H "Authorization: Bearer $TOK" -H "Content-Type: application/json")
```

### Liste og enkelt afsnit

```bash
curl -s "${A[@]}" "$BASE/api/podcast?$SITE"                  # 200 {"afsnit":[…]}
curl -s "${A[@]}" "$BASE/api/podcast/mit-afsnit?$SITE"       # 200 · 404 hvis det ikke findes
```

### Opret et afsnit — to veje ind

**Manuelt**, når afsnittet ikke stammer fra en artikel (en fast intro, et
interview, en opsamling):

```bash
curl -s -X POST "${A[@]}" \
  -d '{"slug":"afsnit-01","titel":"Første afsnit","saeson":1,"nummer":1}' \
  "$BASE/api/podcast?$SITE"
```

→ **201** med afsnittet i `kladde` og et tomt manuskript. Derefter skriver du
replikkerne med `PATCH` (nedenfor).

| status | hvornår |
|---|---|
| 400 | slug'en er ikke små bogstaver, tal og bindestreger |
| 400 | `nummer`/`saeson` er ikke et helt tal ≥ 0 |
| 409 | afsnittet findes allerede — et «opret» overskriver ikke |

`saeson` og `nummer` er begge valgfrie. Udelader du dem, er afsnittet
unummereret og ligger sidst i listen — en kladde, ikke det nyeste. **`0` er et
gyldigt nummer**, så send tom streng (eller udelad feltet) hvis du mener «intet
tal»; den oplagte `Number(x) || undefined` i din egen klient ville kaste 0 væk.

**Listen kommer sorteret fra serveren** — sæson faldende, så nummer faldende.
Rækkefølgen er en del af svaret, så du ikke skal finde på din egen.

### Skab afsnittet ved at generere manuskriptet

`generate` er **den eneste vej til at skabe et afsnit** — et afsnit laves altid
ud fra en artikel. `samling` er valgfri og er `posts` som standard.

```bash
curl -s -X POST "${A[@]}" -d '{"artikel":"min-artikel-slug"}' \
  "$BASE/api/podcast/mit-afsnit/generate?$SITE"
```

Målt: **200 på 37 sekunder** for en artikel på 5.908 tegn → 30 replikker dansk
dialog med skift ved hver replik. Tilstanden bliver `manuskript-klar`.

Fejl du vil møde, og hvad de betyder:

| status | besked | |
|---|---|---|
| 400 | `«artikel» (slug) mangler` | |
| 409 | `artiklen … findes ikke` | |
| 409 | `artiklen har kun N tegn brødtekst — for lidt til et afsnit` | grænsen er 200 |
| 409 | `manuskriptet blev afvist: …` | modellens svar holdt ikke — **dokumentet er urørt** |
| 409 | `afsnittet står som «godkendt» — træk godkendelsen tilbage først` | se nedenfor |

### Ret manuskriptet

```bash
curl -s -X PATCH "${A[@]}" \
  -d '{"replikker":[{"speaker":"aidan","text":"…"},{"speaker":"airina","text":"…"}]}' \
  "$BASE/api/podcast/mit-afsnit?$SITE"
```

Samme validering som på et genereret manuskript: mindst 4 replikker, kendte
talere, ingen tomme tekster, og **begge værter skal optræde** — en monolog er
ikke en samtale, uanset hvem der skrev den.

En rettelse **trækker godkendelsen tilbage automatisk**. Det er ikke noget du
skal huske; det er dét der gør reglen til en spærre.

PATCH er et *rettelses*-verbum: den 404'er hvis afsnittet ikke findes.

### Godkend

```bash
curl -s -X POST "${A[@]}" -d '{"tilstand":"godkendt"}' \
  "$BASE/api/podcast/mit-afsnit/state?$SITE"
```

Lovlige overgange:

```
kladde → manuskript-klar → godkendt → indspillet → udgivet
                    ↑            ↓          ↓          ↓
                    └── en rettelse fører altid hertil ──┘
```

En ulovlig overgang giver 409 med en besked der siger hvorfor — ikke en tavs
no-op.

### Hvad koster det, og hvad vil fejle

```bash
curl -s -G "${A[@]}" \
  --data-urlencode 'udtaler=[{"word":"CMS","alias":"se em es"}]' \
  "$BASE/api/podcast/mit-afsnit/estimate?$SITE"
```

Koster **ingenting** og kalder ingen udbyder — så prisen kan stå på knappen før
nogen trykker. Målt svar:

```
4764 tegn · USD 0,72 · ~5,3 min · klar=false
  OK  Manuskriptet har indhold
  OK  Udtale-ordbogen er ren
  NEJ Begge stemmer er valgt — kun 0 stemme(r) valgt
  NEJ Stemmerne svarer — ikke slået op hos udbyderen endnu
  OK  Din godkendelse
```

**Ordbogen er din, ikke vores.** Motoren validerer den ordbog du sender og ejer
den ikke — dit sites udtale af «harness» er dit sites. ElevenLabs **afviser
IPA**, så kun `alias` virker; sender du IPA, navngiver tjekket rækkerne:

> `2 række(r) bruger IPA, som udbyderen afviser: harness, agenter. Skriv dem om som lyd-alias.`

**«Ikke slået op» tæller som ikke-ok.** Et tjek der stiltiende består når ingen
har spurgt, er værre end intet tjek — det ser grønt ud.

### Indspil

```bash
curl -s -X POST "${A[@]}" \
  -d '{"stemmer":{"aidan":"Rachel","airina":"Bella"}}' \
  "$BASE/api/podcast/mit-afsnit/record?$SITE"
```

Det eneste kald der **bruger rigtige penge**. Tre ting at vide:

1. **Spærret på godkendelsen, server-side.** Et ikke-godkendt afsnit giver 409:
   *«manuskriptet er ikke godkendt (står som «manuskript-klar»). Indspilning
   bruger rigtige penge…»* Et flueben i din browser er en høflighed; spærren
   ligger hvor pengene bruges.
2. **Lyden er nøglet på (manuskript + stemmer).** Samme manuskript og samme
   stemmer giver samme fil og koster ikke igen. En ændret replik — eller en
   ændret stemme — giver en NY fil, så en rettelse ikke overskriver lyd der
   stadig bruges. Manuskriptet er også underteksterne.
3. **En fejl efterlader afsnittet i sin FORRIGE tilstand.** Målt: et fejlet kald
   lod afsnittet stå som `godkendt` uden `lydUrl` — ikke som «indspillet» med en
   manglende fil, hvilket ville se færdigt ud. Kan lyden ikke gemmes efter den er
   lavet, siger beskeden eksplicit at pengene ER brugt.

### Udgiv

```bash
curl -s -X POST "${A[@]}" -d '{"tilstand":"udgivet"}' \
  "$BASE/api/podcast/mit-afsnit/state?$SITE"
```

---

## 3. Hvad der sker uden token

Alle seks ruter, målt uden `Authorization` og uden cookies:

```
GET   /api/podcast                 401
GET   /api/podcast/{slug}          401
PATCH /api/podcast/{slug}          401
POST  /api/podcast/{slug}/generate 401
POST  /api/podcast/{slug}/state    401
POST  /api/podcast/{slug}/record   401
```

`{"error":"Unauthorized"}`, og afsnittet er bagefter urørt.

---

## 4. Rolle-teksterne kan du ændre selv

Hvordan de to værter opfører sig ligger i sitets konfiguration, ikke i vores kode
— så du kan justere dem uden en udrulning:

| felt | |
|---|---|
| `podcastAidanRolle` | han forklarer |
| `podcastAirinaRolle` | hun spørger på lytterens vegne |
| `podcastStil` | sprog og tone |

```bash
curl -s -X POST -b "cms-session=$TOK" -H 'Content-Type: application/json' \
  -d '{"podcastStil":"Dansk, talesprog, korte sætninger."}' \
  "$BASE/api/admin/site-config?$SITE"
```

Gem-ruten **fletter**, så du kan sende ét felt uden at røre de øvrige.

---

## 5. Byg din egen udgave

Alt cms-admins egen podcast-side kan, gør den gennem præcis de endpoints der
står her — der er ingen genvej ind i motoren. Det er ikke en høflighed: kunne
cms-admin gå udenom, ville der være to veje ind hvoraf kun den ene var prøvet,
og dit panel ville få den utestede. En prøve i vores suite fejler hvis en
skærm importerer motoren direkte.

Så din side-admin kan gøre det samme med dit eget udseende:

| handling | endpoint |
|---|---|
| liste (sorteret) | `GET /api/podcast` |
| opret manuelt | `POST /api/podcast` |
| ét afsnit | `GET /api/podcast/{slug}` |
| ret manuskript | `PATCH /api/podcast/{slug}` |
| generér fra artikel | `POST /api/podcast/{slug}/generate` |
| skift tilstand | `POST /api/podcast/{slug}/state` |
| pris + tjekliste | `GET /api/podcast/{slug}/estimate` |
| indspil | `POST /api/podcast/{slug}/record` |

De tre ting der er værd at kopiere frem for at genopfinde:

1. **Vis prisen PÅ knappen.** `estimate` koster ingenting, så beløbet kan stå
   der før nogen trykker.
2. **Slå «indspil» fra indtil tilstanden er `godkendt`.** Serveren afviser den
   alligevel, men en knap der altid kan trykkes lærer folk at trykke.
3. **Læs `r.ok`.** Alle fejl kommer som `{ "error": "…" }` med en besked der er
   skrevet til at blive vist — ikke en kode du skal slå op.

## 6. Det ene der endnu ikke er bevist

**Selve lydkaldet.** Der findes i skrivende stund ingen `ELEVENLABS_API_KEY` —
hverken lokalt, i Secrets Vault eller som Fly-secret på webhouse-app. Hele kæden
frem til og med `record`'s afvisning er kørt og målt; det der mangler er én
rigtig indspilning, og dermed også sammenligningen mellem estimatet ($0,72) og
den faktisk opkrævede pris.

Alt andet i dette dokument er målt, ikke forventet.
