# F167 — Kontaktformularen på webhouse.dk

> Repo: `webhouse-site`. Christian bad om Turnstile; formularen viste sig ikke at
> virke overhovedet.

## Den ubehagelige del først

```
$ curl -X POST https://wh-site.webhouse.net/api/contact -d '{…}'
{"error":"Internal server error"}   HTTP 500

# app-loggen
Contact form proxy error: TypeError: fetch failed
  code: 'ECONNREFUSED'
```

**Hver eneste henvendelse fra kontaktformularen er gået tabt.** Ikke afvist —
tabt. Den besøgende har set en fejlbesked; ingen hos WebHouse har set noget.
Antallet kan ikke opgøres, fordi der ikke findes en log over det der aldrig kom
frem.

## Rodårsagen, for tredje gang i dag

```ts
const CMS_ADMIN_URL = process.env.CMS_ADMIN_URL || "http://localhost:3010";
```

`CMS_ADMIN_URL` er ikke sat i produktion — `flyctl secrets list -a webhouse-dk`
viser kun `REVALIDATE_SECRET`. Så **fallbacken ER værdien**, og serveren sender
hver henvendelse til sin egen localhost.

| # | Hvor | Standardværdien |
|---|---|---|
| 1 | `deployFlyLiveAppName` ([F166.1](./F166.1-udgivelsesvejen.md)) | CMS-adminens egen app |
| 2 | `NEXT_PUBLIC_SITE_URL` i 7 filer ([F166.7](./F166.7-sitemap-domaene-og-sprog.md)) | `https://webhouse.app` |
| 3 | `CMS_ADMIN_URL` (her) | `http://localhost:3010` |

Tre gange samme form: en hardkodet standardværdi der dækker over en variabel
ingen satte. Husets regel om **én kilde per værdi** er ikke en stilpræference —
den er skrevet af præcis denne fejl.

Derfor: adressen får **ingen** fallback. Mangler den, skal det sige fra højt og
én gang, i stedet for at sende posten et sted hen hvor ingen bor.

## Turnstile — genbrug, ikke gen-rul

`@broberg/forms-turnstile` v0.3.0 findes i flådens delte inventar
(Discovery F024): honeypot, IP-rate-limit, server-side siteverify, og et
`/react`-eksport bygget netop til Next.js. fd-sundhed kører den i produktion.

Den bærer også en lære vi ellers ville have genopfundet (F024.7): **gate
send-knappen på widgetens STATUS, ikke på om der ligger et token.** Et tomt
token har tre årsager — scriptet blev ikke hentet, det blev hentet men
`window.turnstile` mangler, widgeten blev aldrig sat på — og kun én af dem er
brugeren. Før det fandtes en status, gav en blokeret widget en send-knap der
aldrig blev aktiv, og intet sted sagde hvorfor.

## Arkitektur

1. **Leveringen først.** `/api/contact` læser CMS-adressen fra én kilde uden
   fallback. Sæt den som Fly-secret. Bevis at en indsendelse lander i indbakken.
2. **Turnstile-widget** i formularen via pakkens `/react`-hook. Send-knappen
   gates på `status === 'solved'`.
3. **Server-side verifikation** i `/api/contact` via pakkens kerne, FØR
   videresendelsen. Et afvist token når aldrig indbakken.
4. **Ship dark:** uden nøgler skal formularen stadig levere — men en deployet
   instans uden nøgler skal sige fra i loggen, ikke tavst være ubeskyttet.
   (Samme form som mail-gatens boot-check.)
5. **`data-testid`** på hvert felt og hver knap. Formularen har ingen i dag, så
   Lens kan hverken udfylde eller verificere den.

## Non-goals

- Andre formularer end kontaktformularen.
- At bygge et eget spam-lag. Mangler pakken noget, udvides pakken.

## Sådan bevises det

En rigtig indsendelse i en rigtig browser, og beskeden **læst tilbage fra
indbakken** — ikke en "Tak"-boble. En kvittering på skærmen er komponentens
egen mening om hvad den forsøgte; det er netop dét der har stået og løjet her.
Og en indsendelse UDEN gyldigt token skal afvises af serveren.
