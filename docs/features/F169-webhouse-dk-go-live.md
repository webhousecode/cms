# F169 — webhouse.dk peger på det nye site

**Status:** i gang — Christian gav GO 2026-08-25 · trin 0 udført 10:40

> "gør klar til at flip sitet til webhouse.dk og www.webhouse.dk UDEN at ændre på mail DNS info etc. Sitet skal køre på Fly hvor det kører nu."

## Hvor vi står

| Navn | I dag | Skal blive |
|---|---|---|
| `webhouse.dk` | A 35.158.249.19 (AWS), 301 → www | A/AAAA → Fly, 301 → www |
| `www.webhouse.dk` | A 35.158.249.19, svarer 200 | A/AAAA → Fly, svarer 200 |
| MX, SPF, DKIM, DMARC, verifikations-TXT | Google Workspace m.m. | **urørt** |

Zonen ligger på **vores egne** nameservere (`ns1/ns2.ppi.dk`) og styres gennem vores egen DNS-API. Fly-appen er `webhouse-dk`, i dag på `wh-site.webhouse.net`.

**Zonen er meget større end den ser ud udefra.** buddy læste den direkte: **112 records** — 34 A, 50 CNAME, 15 MX, 13 TXT. Meget af det er gammel kundeinfrastruktur der stadig peger et sted (cowi, roblon, teejays, klub100hm, zabbix, loghost, webserver5/6/8, flere wildcards). Min måling udefra så en håndfuld. **Intet af det røres.**

De to rækker der ændres:

```
A @    a938fd4bf2a3   35.158.249.19
A www  6e74faafdf59   35.158.249.19
```

## Hvorfor mailen ikke er i fare — og den ene måde den kunne komme det

Kun **to navne** ændres, plus to `_acme-challenge`-CNAMEs. MX peger på Google og bliver liggende; SPF, DKIM og DMARC er TXT/CNAME på andre navne og bliver liggende.

Den ene reelle risiko: **apex-A og apex-MX deler navnet `@`.** Skrives `@` med en operation der ERSTATTER alt på navnet i stedet for kun A-typen, ryger mailen med. Derfor udfører buddy ændringen — den skriver pr. record-**id**, ikke pr. navn. Vi sender ikke et "sæt @ til dette" og håber.

## www forbliver den kanoniske adresse

Apex 301'er allerede til www i dag, så alt hvad søgemaskiner og eksisterende links kender, peger på www. Skiftede vi til apex, flyttede vi hele sitets historik til en adresse ingen kender. Den redirect skal derfor med over i det nye site — ellers svarer begge stavemåder på de samme sider, og søgemaskinen skal gætte hvilken der er siden.

## Runbook

### 0 · Sæt TTL ned FØRST — og vent ✔ UDFØRT 10:40

```
A @    a938fd4bf2a3   ttl 1800 → 60   ip uændret
A www  6e74faafdf59   ttl 1800 → 60   ip uændret
```

Verificeret ved en **frisk hentning**, ikke på svaret fra den samme operation der skrev: tilføjet 0 · fjernet 0 · ændret 2 · uændret 110. Apex-MX 5/5 til stede. Begge autoritative nameservere svarer 60.

**Ventetiden kan ikke forkortes, og grunden er værd at have præcist:** en nedsat TTL virker ikke bagud. En resolver der nåede at hente rækken med 1800 holder den gamle værdi i op til 30 minutter endnu, uanset hvad vi har skrevet nu. At 1.1.1.1 allerede svarer 60 betyder kun at **DEN** havde fornyet — ikke at alle har. Skifter vi IP før ventetiden er ude, findes der resolvere der holder den gamle adresse en halv time, og en tilbagerulning ville være lige så langsom som før vi gjorde noget. **A/AAAA tidligst ≥ 11:12.**

Zone-kopien er gemt som fil, ikke som et tal:

```
docs/dns/webhouse.dk-zone-FOER-flyt-2026-08-25T104044+0200.json   (buddy)
112 records · sha256 3467159677bc3c66
```

Efter-listningen sammenlignes mod **den fil** — indhold mod indhold. "112 før, 112 efter" ville bestå selvom to var byttet om, og så er kontrollen et instrument der ikke kan se den fejl den bærer navn efter.

### 1 · Lad certifikaterne udstede før trafikken flyttes

Certifikaterne er oprettet på Fly. To CNAMEs lader dem udstede **inden** noget flyttes, så skiftet bliver uden nedetid. De er nye navne, rører intet eksisterende og venter ikke på nogen cache:

```
CNAME _acme-challenge.webhouse.dk      → webhouse.dk.gk20wen.flydns.net.
CNAME _acme-challenge.www.webhouse.dk  → www.webhouse.dk.gk20wen.flydns.net.
```

Der er **ingen CAA-records** i zonen, så Let's Encrypt kan udstede uden at vi rører mere. (Havde der ligget en CAA der kun tillod en anden udsteder, var certifikatet fejlet tavst.)

Vent til `fly certs check webhouse.dk` og `… www.webhouse.dk` siger **Issued**.

### 2 · Byg sitet med sin nye adresse

`NEXT_PUBLIC_SITE_URL` bages ind ved **byg**, ikke ved kørsel — sitemap, feed, hreflang, JSON-LD og hver metadata-tag læser den. Uden en ny bygning ville sitet stå på den nye adresse og fortsætte med at fortælle Google at det bor på den gamle:

```
flyctl deploy --remote-only -a webhouse-dk \
  --build-arg NEXT_PUBLIC_SITE_URL=https://www.webhouse.dk
```

Den bygning tænder også apex→www-redirecten af sig selv (den er inert så længe adressen er staging-adressen). Den er ufarlig at lægge ud før DNS flytter: apex og www peger stadig på den gamle maskine, så redirecten kan ikke ramme nogen endnu, og `wh-site.webhouse.net` rører den med vilje ikke.

### 3 · Flyt trafikken — én batch, via buddy, tidligst 11:12

```
A     webhouse.dk       → 66.241.125.55            (erstat 35.158.249.19)
AAAA  webhouse.dk       → 2a09:8280:1::ed:6bd5:0   (ny)
A     www.webhouse.dk   → 66.241.125.55            (erstat 35.158.249.19)
AAAA  www.webhouse.dk   → 2a09:8280:1::ed:6bd5:0   (ny)
```

Som **én** operation, ikke fire der kan strande halvvejs. Den gamle A-værdi skal væk i samme ombæring — to A-records på samme navn sender halvdelen af de besøgende til det gamle site.

### 4 · Ret CMS'ets forestilling om hvor sitet bor

`previewSiteUrl` for `webhouse-site` skal være `https://www.webhouse.dk`. Den styrer både forhåndsvisning OG hvilke adresser der må gemme via klik-til-redigering (CORS). Glemmes den, holder inline-redigering op med at virke på den nye adresse — og fejlen viser sig som "kunne ikke gemme", ikke som noget der peger på DNS.

### 5 · Efter flippet — hvad der skal måles, ikke antages

- **Begge IP-familier hver for sig.** `dig -4` og `dig -6`. Zonen har i dag **ikke én eneste AAAA** — vi giver domænet IPv6 for første gang. Går Fly's v6 ned mens v4 kører, fejler kun v6-foretrækkende klienter, og udefra ser siden ud til at virke. "Siden svarer" er ikke svar nok her.
- `https://www.webhouse.dk` → 200 med gyldigt certifikat
- `https://webhouse.dk` → 301 til www
- `sitemap.xml` nævner **www.webhouse.dk** og hverken webhouse.app eller wh-site
- **en testmail sendes OG modtages** på en @webhouse.dk-adresse, og `dig MX` er uændret
- klik-til-redigering kan gemme et felt på den nye adresse, læst tilbage fra serveren
- **zonen sammenlignes mod filen fra trin 0** — indhold mod indhold, ikke antal mod antal
- Turnstile: nøglen dækker allerede webhouse.dk + www.webhouse.dk

## ⚠️ Den gamle maskine må IKKE slukkes bagefter

`35.158.249.19` bærer **7 A-records**, ikke 2: `@`, `www`, og dertil **`osm`, `osm1`, `osm2`, `osm3`, `osm4`**.

De fem osm-navne bliver stående på den maskine efter skiftet. AWS-instansen skal altså blive kørende, selvom "sitet er væk fra den". Det er præcis den slags der bliver slukket tre uger senere af en der kun husker at .dk blev flyttet.

Selve skiftet rører dem ikke — kun `@` og `www` ændres, og de fem peger videre på samme IP.

## Tilbagerulning

```
A @    id a938fd4bf2a3  → 35.158.249.19
A www  id 6e74faafdf59  → 35.158.249.19
```
plus fjern de to AAAA. Med TTL 60 er alle tilbage inden for et minut. Certifikater og `_acme-challenge` kan blive stående — de gør ingen skade og sparer ventetid ved næste forsøg.

## Det der IKKE sker

- Sitet flytter ikke maskine. Det bliver på den Fly-app det kører på nu.
- `wh-site.webhouse.net` bliver ved med at svare. Den er staging-adressen og det er den Lens kører imod; redirecten rører den med vilje ikke.
- Ingen mail-record ændres. Hverken MX, SPF, DKIM, DMARC eller verifikations-TXT.
- Ingen af zonens øvrige 108 records ændres.
- Den gamle AWS-maskine slukkes ikke.

## Stories

- **F169.1** — forberedelse: certifikater, kanonisk redirect, runbook. ✔
- **F169.2** — selve flippet. I gang.
