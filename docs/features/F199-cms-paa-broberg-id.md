# F199 — cms logger ind gennem Broberg ID

## Motivation

Christian, 22. september 2026: «der ikke er rigtige kunder ud over Sanne Andersen
og broberg.ai endnu, så tiden er vel NU.»

Broberg ID (BID) er flådens fælles login. HelpDesk er koblet på og kører i
produktion — målt af broberg-id samme dag: `client_id=helpdesk` svarer
`invalid_redirect` (klienten FINDES) mod `invalid_client` for et opdigtet navn.
cms bliver forbruger nummer to.

`broberg-id`-sessionen skriver implementeringsplanen. **Dette dokument er
cms-siden: hvad der faktisk står i vores kode, målt frem for husket, så planen
ikke bygger på en læsning udefra.**

## Vinduet — målt, ikke skiftet

Alt nedenfor er læst i produktionen på `webhouse-app` 22/9-2026 (SSH, kun
læsning) og i koden. Ikke fra hukommelsen.

| | |
|---|---|
| Rigtige brugere | **2**. `cb@webhouse.dk` (admin, 13/3) · `mail@sanneandersen.dk` (editor, 13/5, `invitedBy` cb) |
| Installationer | **ÉN**. `webhouse-cms` er **suspended siden 27/4-2026**; kun `webhouse-app` er deployed |
| Kunder | Sanne Andersen — en org+site INDE i webhouse-app (`beam-sites/sanneandersen`), ikke en egen installation. Øvrige sites (broberg.ai, webhouse-site, trail) er Christians egne |
| GitHub-login | Tvendt i produktion (`GITHUB_OAUTH_CLIENT_ID` m.fl. Deployed), men **nul** brugere har `githubUsername` i den levende brugerfil. Arv, ikke i brug |

## Hvad BID's rapport havde forkert — og hvorfor det gør opgaven mindre

Deres konsekvensrapport (`cms-paa-bid-2026-09-22.md`) er læst udefra vores kode.
Tre af dens præmisser holder ikke, og alle tre trækker i retning af «større
opgave end den er»:

### 1. Rollen ligger IKKE i tokenet for mennesker — den slås allerede op

`lib/require-role.ts:21-35`:

```ts
export async function getSiteRole(): Promise<UserRole | null> {
  const session = await getSessionUser(cookieStore);
  if (!session) return null;
  if (isSelfDescribingPrincipal(session.sub)) return session.role;  // dev-token | service-token | lens
  const members = await getTeamMembers();                           // team.json for det AKTIVE site
  const membership = members.find((m) => m.userId === session.sub);
  return membership?.role ?? null;                                  // fail-closed
}
```

JWT'et bærer `role` (`auth.ts:173`), men den værdi læses kun for tre
maskin-principaler. For et menneske er den død vægt. **Det forberedende arbejde
BID anbefaler, er altså allerede gjort.** Tilbage står kun at fjerne feltet fra
payloaden, og det er hygiejne — ikke en forudsætning.

### 2. Roller er PR. SITE, ikke CMS-wide

Kommentaren «CMS-wide, not per-site» i `auth.ts` beskriver **kontoen**
(`users.json`), ikke rettigheden. Målt på volumen:

```
/data/cms-admin/_data/team.json                            cb: admin
/data/cms-admin/beam-sites/webhouse-site/_data/team.json   cb: admin
/data/cms-admin/beam-sites/trail/_data/team.json           cb: admin
/data/cms-admin/beam-sites/sanneandersen/_data/team.json   cb: admin · 1d18a772…: editor
```

Sanne er editor **på sit eget site** og har ingen rolle andre steder. Det er
snævringen BID skal koble sig på: **BID afgør HVEM, `team.json` afgør HVAD.**

### 3. Inline-redigering er IKKE en anden login-flade

Christian sagde «CMS har sit eget master login samt et der anvendes til at
redigere inline i selve sitet», og BID frygtede den svære variant: et login på
kundens eget domæne, hvor et statisk browser-bundt ikke kan bære en hemmelighed.

**Der er to OPLEVELSER, men én identitet.**

```
app/admin/inline-edit/connect/route.ts   veksler admin-login → edit-token
lib/inline-edit-token.ts                 mintEditSessionToken() — eneste kilde
proxy.ts:395-415 + isAllowedForEditSession()   spærren
app/api/inline-edit/token/route.ts       headless mint (Lens/service), samme kontrakt
```

Flowet ligger **under `/admin`** — filens egen kommentar siger hvorfor: *«Lives
under /admin so proxy.ts's existing auth gate applies for free.»* Redaktøren
logger altså ind med masterloginet, og får derefter mintet et `editSession`-JWT
(samme nøgle, samme form som `cms-session`, plus `editSession: true` +
`site: <id>`, TTL 30 døgn). Tokenet overleveres til site-fanen via
origin-valideret `postMessage` eller `?cms_edit=<token>` og sendes som Bearer.

**Spærren er ikke levetiden, men en positiv hvidliste** (`proxy.ts`):

```
GET|PATCH  /api/cms/{collection}/{slug}   — kun når ?site= == tokenets eget site
GET        /api/auth/me
GET        /api/inline-edit/pages          (eget site)
POST       /api/inline-edit/toggle         (eget site)
alt andet → 403
```

Kodens egen kommentar: *«This is the actual security boundary; the token's
30-day TTL + site-scope alone are not sufficient.»*

**Konsekvenser for planen:**

- Kobles admin på BID, følger inline-redigering med. Ingen separat opgave.
- **ÉN redirect-URI**, på webhouse.app — ikke én pr. kundedomæne. BID's F084.12
  (tenant på kundens eget domæne) er **ikke** en forudsætning.
- Statisk eller server-renderet site er ligegyldigt: sitet modtager aldrig et
  callback, kun et token.

## Maskin-principaler flytter IKKE

Tre `sub`-værdier får deres rolle fra JWT'et (`isSelfDescribingPrincipal`):

| `sub` | hvad | flytter til BID? |
|---|---|---|
| `dev-token` | `CMS_DEV_TOKEN`, lokal udvikling | nej |
| `service-token` | `X-CMS-Service-Token` = `CMS_JWT_SECRET`; proxy.ts + tools-scheduler.ts | nej |
| `lens` | visuel verifikation, read-only via write-guard | nej |

BID logger **mennesker** ind. Planlæg ikke en migrering af disse.

## Blokeringen — og den er BID's

**BID kan i dag ikke svare på om en konto ejer en BESTEMT mailadresse**
(deres kort F084.38, backlog). Et menneske kan eje flere bekræftede adresser;
tokenet bærer kun den primære.

Vores invitationsflow står på adressen. Inviteres `mail@sanneandersen.dk` og
logger hun ind med en Google-konto, indløses invitationen ikke. `getSiteRole()`
er fail-closed, så hun får **ingen** rolle — ikke en forkert. Den rigtige retning
at fejle i, men fra hendes stol er det et nedbrud: hun kan ikke redigere sin egen
klinik.

**cms kan ikke koble på før F084.38 er løst.** Ikke «bør vente» — kan ikke.

## Prisen, som skal stå som en pris

BID kører på ÉN maskine med ÉT diskområde, og der er **ingen nøddør**. I dag kan
Sanne altid komme ind med sit kodeord, uanset hvad der ellers er nede. Efter
koblingen kan hun ikke redigere noget når BID er nede. Det er første gang en af
Christians kunder bliver afhængig af den tjeneste.

Det er ikke et argument imod — det er et krav til F199.3.

## Fund på vores egen volumen (ikke en del af koblingen)

To brugerfiler, allerede drevet fra hinanden:

```
/data/cms-admin/_data/users.json   mtime 2026-08-31   ← den LEVENDE (getAdminDataDir auto-detekterer /data/cms-admin)
/data/_data/users.json             mtime 2026-07-09   ← forældreløs kopi, læses af ingen
```

Den forældede kopi har `githubUsername: "cbroberg"` på cb; den levende har ikke.
Havde nogen læst den forkerte, var svaret pæ «bruger nogen GitHub-login?» blevet
det modsatte. **Ikke slettet** — det er destruktivt på produktionsdata og kræver
Christians egne ord.

## Genoptaget 28/9-2026 — sådan blev koblingen bygget (F199.2)

Christian 28/9: «gør dig klar til at blive rullet ind i BID … husk inline-edit
login … send mail til Sanne Andersen og andre RIGTIGE cms brugere». Begge
betingelser fra pausen er opfyldt: BID kører på to maskiner mod Supabase i
eu-north-1 (F084.65, 23/9), og F084.38 er ikke længere en blokering for SKIFTET
(se nedenfor) — kun for NÆSTE invitation.

- **Klient:** `cms`, confidential, registreret af broberg-id og læst tilbage
  (redirect `https://webhouse.app/api/auth/bid/callback` + localhost:3010).
  Hemmeligheden ligger i cms' vault (`01a0e935…`, env `SSO_CLIENT_SECRET`).
- **Pakke:** `@broberg/sso` 0.3.2, exact-pinned (frozen-deps LEDGER). Next.js
  bruger kernen, ingen adapter.
- **Identitet på `sub`, aldrig adresse.** `users.json` fik `bidSub`.
  `lib/bid-resolve.ts` er den eneste kobling: kendt `sub` → den bruger; ellers en
  BID-**verificeret** adresse der matcher præcis én ubundet bruger → bind. Ellers
  ingen adgang og ingen ny bruger (fail-closed).
- **«Kobl Broberg ID» fra en logget-ind session** (Account → Security). Det er
  sådan Christian kobles: hans BID-primære er cb@broberg.ai, cms kender ham som
  cb@webhouse.dk. cms-sessionen er beviset på hvem han er, så adressen behøver
  ikke matche. Det løser F084.38-klassen for eksisterende brugere generelt.
- **Samme cms-session bagefter.** Callback'en udsteder præcis det JWT et
  kodeords-login giver (`createToken`), så `getSiteRole()`, team.json, proxy og
  inline-edit's editSession-mint er urørte. Inline-redigering følger med.
- **Flow-cookien** er signeret med udløb på signaturen (600 s) og lever 3× i
  browseren, så «for gammel», «aldrig startet» og «ikke vores» får hver sit svar.
- **Kendt afvigelse:** et BID-login springer cms' egen TOTP over — BID er
  identitetsudbyderen, og dens egen login-styrke gælder.
- **F199.3 → F199.4, samme aften:** Christian valgte først «Kun Broberg ID +
  skjult nøddør», og trak nøddøren tilbage timer senere med BID's login-regel
  (gælder alle apps på BID): **én login-dialog, BID's.** Med BID-miljø sat har
  webhouse.app ingen egen kode-, passkey-, TOTP-, GitHub- eller QR-login for
  nogen — heller ikke admin. `legacyLoginAllowed()` i `lib/bid.ts` håndhæver det
  dér hvor sessionen udstedes; Account → Security skjuler de paneler.
  **Koden er slået fra, ikke slettet:** en selvhostet @webhouse/cms uden BID har
  stadig sit login (non-goal B-modellen). Konsekvensen er skrevet ned: er BID nede,
  kan ingen logge NYT ind på webhouse.app; eksisterende sessioner kører videre.
- **Sanne:** BID's egen invitationsmail («webhouse.app flytter til Broberg ID»)
  sendes af broberg-id, først når login er bevist på webhouse.app. Hendes konto
  oprettes med mail@sanneandersen.dk, så første BID-login binder automatisk.

## Non-goals

- **B-modellen:** at enhver der installerer `@webhouse/cms-admin` skal logge sine
  redaktører ind via BID. Pakken kører på kundens egen maskine med kundens egen
  `CMS_JWT_SECRET`. Gør vi BID obligatorisk dér, har vi solgt et produkt der ikke
  kan køre uden en tjeneste vi selv hoster — og brudt produktets eneste rigtige
  løfte: du kan installere det og køre det selv. B er derfor **valgfrit for
  altid**, en udbyder man kan slå til, aldrig den eneste dør.
- At flytte maskin-principalerne.
- At røre `team.json`-modellen. BID erstatter identiteten, ikke rettigheden.

## Reuse

Discovery-tjek kørt: `@broberg/auth` findes som fælles pakke, men **BID er selv
tjenesten** — opgaven her er at blive FORBRUGER af `id.broberg.ai`, ikke at bygge
et login. Vejledningen står på `id.broberg.ai/docs` (agent-udgave på `/llms.txt`),
og HelpDesk er den første forbruger, altså den eneste eksisterende reference. Vi
bygger intet eget: vi genbruger BID's OAuth-flow og beholder vores eget
rolle-opslag (`team.json`), som ikke findes i nogen delt pakke fordi den er
CMS'ets egen datamodel.
