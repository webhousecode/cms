# F189 — Podcast-motoren: API først, så et site kan bygge sit eget adminpanel

> Ejerens note på den godkendte mockup, 7. september 2026, ordret:
>
> *«Byg denne motor men med et komplet API da jeg vil have et kommende Admin panel
> bag ved et login i selve det site der anvender CMS. Dette giver mulighed for
> headless cms og custom tools ude i sitet som der er lavet rigtigt meget af på
> sanneandersen.dk og det vil vi også begynde på med broberg.ai som er den første
> kunde til Podcast»*

## Hvad noten ændrer

Den er ikke en tilføjelse til podcast-featuren. **Den er dens arkitektur.**

Uden noten ville motoren blive bygget som en side i cms-admin med sin logik i
en React-komponent, og API'et ville blive noget man tilføjede bagefter til de
dele nogen kom til at mangle. Med noten er rækkefølgen omvendt: **API'et er
produktet, cms-admins UI er dets første klient.**

Den konkrete prøve gennem hele epicen: *kan et site udenfor gennemføre HELE
forløbet — fra artikel til udgivet afsnit — uden at åbne cms-admin?* Er svaret
nej for én handling, er den handling ikke færdig.

## Hvor tingene hører til

| | |
|---|---|
| **cms** (dette repo) | motoren, API'et, og admin-UI'et i cms-admin |
| **broberg-ai-site** | forbrugeren: de offentlige `/podcast`-sider, og senere sitets eget panel |

Den funktionelle plan — motor, priser, stemmer, målte forhindringer — står i
broberg-ai-site's `docs/features/F012-podcast.md` og gentages ikke her. Dette
kort ejer **motoren og API-fladen**.

Godkendte mockups (begge, 7/9): lytterens side `01a07acf-1c1c-7bcd-88a2-fee0353079d4`
· redaktørens side `01a07b9e-2f39-7712-a4f2-4372d50b333a`.

## Auth — målt før valgt, så der ikke opstår en femte vej

cms-admin har allerede **fire** klient-klasser ind i API'et:

| vej | hvem | form |
|---|---|---|
| `cms-session`-cookie | admin-UI'et | cookie |
| `wh_` Bearer / `X-CMS-Service-Token` | maskinkaldere | proxy laver dem om til cookies |
| editSession-JWT | inline-redigering | allowlistet i proxy, site-scopet |
| **bruger-JWT som Bearer** | `/api/mobile/*` — **27 ruter** | JSON, ingen cookies, CORS |

**Den fjerde ER den form ejeren beder om:** et separat frontend, med sit eget
login, der taler JSON over Bearer. Et site-panel er bare ikke «mobil».

Så: **nyt præfiks, samme auth.** `/api/podcast/*` bruger den SAMME
JWT-verifikations-hjælper som mobil-ruterne og den SAMME CORS-model som
`forms/[name]` allerede bruger (reflekterer sitets `previewSiteUrl`, intet nyt
konfigurationsfelt). Husets egen hard rule siger det ordret: *«no parallel auth
path»*.

**Ingen ny tilladelse uden at den er gated på alle lag.** Podcasten får sine
egne permissions i `permissions-shared.ts`, og hver rute + hvert UI-element
går gennem `requirePermission` / `can()`. Det er ikke valgfrit her — en af
handlingerne bruger rigtige penge.

## Den ene handling der koster penge

Indspilning kalder ElevenLabs og koster ~$1,48 pr. afsnit. Det giver tre krav
der ikke findes i resten af CMS'et, og som mockup'en allerede viser:

1. **Prisen skal kunne beregnes UDEN at bruge den.** Et estimat-endpoint er en
   førsteklasses del af API'et, ikke en detalje i UI'et — ellers kan et
   site-panel ikke vise prisen på sin egen knap.
2. **Godkendelse er en tilstand, ikke en dialog.** Indspilning afvises
   server-side på et manuskript der ikke er godkendt. Et flueben i en browser er
   en høflighed; spærren skal ligge hvor pengene bruges.
3. **Før-flyvnings-tjekket er et endpoint.** De to MÅLTE forhindringer fra F012 —
   udbyderen afviser IPA-udtaler (vi har seks), og bindestregs-fejlen ville sige
   «AI-agenter» forkert — skal fanges FØR pengene bruges, af noget enhver klient
   kan spørge.

## Manuskriptet er et CMS-dokument

Uforandret fra F012, og det er grunden til at API-først passer: manuskriptet
ligger allerede i indholdslaget, så et site kan læse og rette det gennem
cms-API'et vi har i forvejen. Motoren tilføjer kun de handlinger indholdslaget
ikke kan: generér, estimér, tjek, indspil, udgiv.

## Non-goals

- **Sitets eget adminpanel.** Ejeren skrev «kommende». Denne epic gør det MULIGT
  og beviser det med rigtige kald udefra; selve panelet er broberg-ai-site's
  arbejde.
- De offentlige `/podcast`-sider og RSS-feedet — også sitets side (F012).
- Et abonnements-/betalingslag oven på indspilningsprisen.

## Reuse

Discovery søgt 7/9 på «podcast», «tts» og «audio» før planen blev skrevet.

| behov | hvor det kommer fra | hvorfor ikke vores eget |
|---|---|---|
| dialog-lyd (to stemmer) | **`@broberg/ai-sdk` · `ai.podcast()`** | findes allerede, ægte dialog-endpoint, omkostning spores pr. kald |
| manuskript-generering | `ai.chat()` gennem samme SDK | én chokepunkt, så pris og fallback virker |
| tale-normalisering | broberg-ai-site's `tilTale()` | GENBRUGES, kopieres ikke — ellers vender bindestregs-fejlen tilbage i podcasten |
| auth | mobil-ruternes JWT-hjælper | en femte auth-vej er drift |
| CORS | `forms/[name]`s origin-logik | intet nyt konfigurationsfelt |

**Byg selv:** kun selve motoren (tilstands-maskinen, estimatet,
før-flyvnings-tjekket, lagringen af lyden) — og den hører i cms, fordi den er en
CMS-evne flere sites skal kunne købe sig ind på.

**Afvist:** podcastfy (Python + FFmpeg, ingen dansk, ingen omkostningssporing) —
målt og begrundet i F012.

## Sådan bevises epicen

Ikke «API'et findes», men: **et kald udefra, med et bruger-token og uden en
eneste cookie, gennemfører hele forløbet fra artikel til udgivet afsnit.** Den
prøve er kravet til den sidste story, og de øvrige er trin på vejen derhen.
