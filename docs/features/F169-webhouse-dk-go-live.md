# F169 — webhouse.dk peger på det nye site

**Status:** in progress · **Bestilt af:** Christian, 2026-08-25

> "gør klar til at flip sitet til webhouse.dk og www.webhouse.dk UDEN at ændre på mail DNS info etc. Sitet skal køre på Fly hvor det kører nu."

## Hvor vi står (målt udefra, før noget blev rørt)

| Navn | I dag | Skal blive |
|---|---|---|
| `webhouse.dk` | A 35.158.249.19 (AWS), 301 → www | A/AAAA → Fly, 301 → www |
| `www.webhouse.dk` | A 35.158.249.19, svarer 200 | A/AAAA → Fly, svarer 200 |
| MX, SPF, DKIM, DMARC, verifikations-TXT | Google Workspace m.m. | **urørt** |

Zonen ligger på `ns1.ppi.dk` / `ns2.ppi.dk`. Fly-appen er `webhouse-dk`, i dag på `wh-site.webhouse.net`.

## Hvorfor mailen ikke er i fare

Kun **to navne** ændres — apex og www — plus to `_acme-challenge`-CNAMEs. Ingen af dem har noget med mail at gøre. MX-records peger på Google og bliver liggende; SPF, DKIM og DMARC er TXT på andre navne og bliver liggende. En A-record og en MX-record er to forskellige spørgsmål til den samme zone, og vi svarer kun på det ene.

## www forbliver den kanoniske adresse

Apex 301'er allerede til www i dag, så alt hvad søgemaskiner og eksisterende links kender, peger på www. Skiftede vi til apex, flyttede vi hele sitets historik til en adresse ingen kender. Den redirect skal derfor med over i det nye site — ellers svarer begge stavemåder på de samme sider, og søgemaskinen skal gætte hvilken der er siden.

## Runbook

### 1 · Før flippet (kan gøres når som helst, ændrer intet for besøgende)

Certifikaterne er allerede oprettet på Fly. De udstedes **før** trafikken flyttes, så skiftet bliver uden nedetid — det kræver kun to CNAMEs, og de rører intet der findes i forvejen:

```
CNAME _acme-challenge.webhouse.dk      → webhouse.dk.gk20wen.flydns.net.
CNAME _acme-challenge.www.webhouse.dk  → www.webhouse.dk.gk20wen.flydns.net.
```

Vent til `fly certs check webhouse.dk` og `… www.webhouse.dk` siger **Issued**. Først da giver det mening at flytte trafik.

### 2 · Byg sitet med sin nye adresse

`NEXT_PUBLIC_SITE_URL` er bagt ind ved **byg**, ikke ved kørsel — sitemap, feed, hreflang, JSON-LD og hver metadata-tag læser den. Uden en ny bygning ville sitet stå på den nye adresse og fortsætte med at fortælle Google at det bor på den gamle:

```
flyctl deploy --remote-only -a webhouse-dk \
  --build-arg NEXT_PUBLIC_SITE_URL=https://www.webhouse.dk
```

Den bygning tænder også apex→www-redirecten af sig selv (den er inert så længe adressen er staging-adressen).

### 3 · Flyt trafikken (via buddy — DNS går aldrig uden om den vej)

```
A     webhouse.dk       → 66.241.125.55
AAAA  webhouse.dk       → 2a09:8280:1::ed:6bd5:0
A     www.webhouse.dk   → 66.241.125.55
AAAA  www.webhouse.dk   → 2a09:8280:1::ed:6bd5:0
```

Slet den gamle A-record på begge navne i samme ombæring — to A-records på samme navn sender halvdelen af besøgende til det gamle site.

### 4 · Ret CMS'ets forestilling om hvor sitet bor

`previewSiteUrl` for `webhouse-site` skal være `https://www.webhouse.dk`. Den styrer både forhåndsvisning OG hvilke adresser der må gemme via klik-til-redigering (CORS). Glemmes den, holder inline-redigering op med at virke på den nye adresse — og fejlen viser sig som "kunne ikke gemme", ikke som noget der peger på DNS.

### 5 · Efter flippet — hvad der skal måles, ikke antages

- `dig +short www.webhouse.dk` giver Fly-adressen fra begge sider af Atlanten
- `https://www.webhouse.dk` svarer 200 med gyldigt certifikat
- `https://webhouse.dk` svarer 301 til www
- `sitemap.xml` nævner **www.webhouse.dk** og hverken webhouse.app eller wh-site
- **en testmail sendes og modtages** på en @webhouse.dk-adresse, og `dig MX` er uændret
- klik-til-redigering kan gemme et felt på den nye adresse (læst tilbage fra serveren)
- Turnstile: nøglen dækker allerede webhouse.dk + www.webhouse.dk

## Det der IKKE sker

- Sitet flytter ikke maskine. Det bliver på den Fly-app det kører på nu.
- `wh-site.webhouse.net` bliver ved med at svare. Den er staging-adressen og det er den Lens kører imod; redirecten rører den med vilje ikke.
- Ingen mail-record ændres. Hverken MX, SPF, DKIM, DMARC eller verifikations-TXT.

## Stories

- **F169.1** — forberedelse: certifikater, kanonisk redirect, runbook.
- **F169.2** — selve flippet. Venter på Christians GO.
