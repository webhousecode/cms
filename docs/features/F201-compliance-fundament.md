# F201 — Compliance-fundament

**Status:** ready · **Ejer:** Christian · **Kilde:** COMPLIANCE-PLAN.md (26/9-2026), gengivet i appendix nedenfor.

## Åbne spørgsmål (øverst med vilje)

1. Hvem er juridisk dataansvarlig/databehandler over for kunderne: WebHouse ApS eller et andet selskab? (Afgør hvilket navn der står på aftaler og trust-side.)
2. Skal compliance på sigt være sit eget cardmem-projekt? Christian lagde det hos cms 26/9; cms kører det, og opgaver i andre repoer sendes til den session der ejer dem.
3. Hvem klikker/underskriver en DPA hos en leverandør når det kræver en konto-ejer? (Forventet: Christian — det er en udadvendt, juridisk handling.)

## Motivation

Kunder (COWI, kommuner, klinikker) spørger om databehandling. I dag findes svaret i hovederne på ~40 sessioner. Planens princip: én kilde (`compliance.yaml`), automatisk indsamlede beviser, og vi siger kun det vi kan bevise.

## Scope — i denne rækkefølge

### F201.1 — Optælling: alle databehandlere i alle projekter
Målt, ikke husket. For hvert cardmem-projekt med et repo: læs den lokale klon (eller GitHub) og find leverandører via
- afhængigheder i `package.json` (SDK'er: resend, stripe, @supabase, openai, … og `@broberg/*` der selv kalder en leverandør),
- env-nøgle-NAVNE i `.env.example`, `fly.toml`, workflows (aldrig værdier),
- udgående værtsnavne i kildekoden (`https://api.…`),
- `fly.toml` `primary_region` (hvor data ligger),
- `@broberg/ai-sdk`-brug: hvilke tiers/overrides → hvilke AI-leverandører.
Resultat: `compliance/compliance.yaml` med én række pr. leverandør: formål, produkter der bruger den, hvilke data der sendes (vurderet pr. produkt), region, og kilden (fil:linje) der beviste brugen. Plus en rå rapport over projekter der IKKE kunne læses — et projekt der ikke blev scannet må aldrig tælle som «ingen leverandører».

### F201.2 — Vurdering pr. leverandør
For hver leverandør fra F201.1, hentet fra leverandørens egne sider (link gemt):
- Har de en DPA? Er den **automatisk en del af vilkårene** (ingen handling), **skal accepteres/underskrives** (klik i dashboard eller e-signatur), eller **findes ikke**?
- Overførselsgrundlag uden for EU: står selskabet på EU-US Data Privacy Framework-listen (tjekkes på dataprivacyframework.gov), eller bruger DPA'en SCC?
- Kan data holdes i EU (region-valg)?
- Er det overhovedet en databehandler (fx login-udbydere og registrarer er typisk ikke)?
Resultat: en tabel med én anbefaling pr. leverandør: **link** (DPA er del af vilkårene) · **acceptér/underskriv** (Christian skal gøre noget, med præcis sti) · **erstat/begræns** (ingen brugbar DPA, eller personfølsomme data til en ikke-EU-rute).

### F201.3 — Christians handlingsliste
Kun de leverandører hvor der skal accepteres/underskrives noget, som en kort liste med link og hvad der skal klikkes. Registreret i compliance.yaml når det er gjort (dato + hvem).

### Senere (egne kort når F201.1–3 er Done)
Planens faser 1–5: fortegnelse (art. 30), DPA-skabelon til kunder, privatlivspolitik, hændelsesplan, DPIA for KAI og FD Sundhed, EU-regel for helbredsdata i ai-sdk, kontrolsæt K1–K15, broberg.ai/trust.

## Non-goals

- Ingen betalt certificering (planens afsnit 9).
- Ingen juridisk rådgivning: vurderingen er en faktuel optælling af hvad leverandørerne selv skriver, med links. Tvivlstilfælde markeres som tvivl.
- Vi accepterer/underskriver ikke selv aftaler hos leverandører.

## Arkitektur

- `compliance/compliance.yaml` i cms-repoet er kilden (flyttes hvis compliance får eget projekt).
- Scanneren er et script i `scripts/compliance-scan.ts`, så optællingen kan gentages (planens «automatisk, ikke manuelt»).
- Trust-siden (senere) læses fra compliance.yaml og vises på broberg.ai; teksten lever i CMS'et.

## Reuse

- discovery.broberg.ai `/api/infra` + `/api/packages`: flådens egen liste over infrastruktur og `@broberg/*`-pakker, bruges som krydstjek af optællingen.
- `@broberg/ai-sdk`s routing-tabel (hvilke tiers går til hvilken leverandør/region) — læses, ikke kopieres.
- Ingen eksisterende compliance-pakke i flåden (tjekkes i discovery inden F201.1 starter).

## Risiko

- En optælling der overser en leverandør ser komplet ud. Derfor: kilde (fil:linje) pr. fund, liste over ikke-scannede projekter, og krydstjek mod discovery.
- Leverandørsider ændrer sig. Hver vurdering bærer dato + link.

## Rollout

F201.1 → F201.2 → F201.3 i rækkefølge. Intet deployes; det er dokumenter + et script.

---

## Appendix — Christians COMPLIANCE-PLAN.md (26/9-2026), ordret uddrag af struktur

Principper: ét kontrolsæt for alle produkter · én kilde (compliance.yaml) · automatiske beviser · vi siger kun det vi kan bevise («SOC 2-ready», aldrig «compliant») · trust-siden er en rute på broberg.ai.

Produkter efter risiko: KAI/Cheirion (helbredsdata, DPIA) · FD Sundhed/Sport · Broberg ID (1) · HelpDesk · Trail · cardmem (2) · Upmetrics · øvrige (3).

Lovkrav: GDPR (fortegnelse, DPA-skabelon, underdatabehandler-liste med 30 dages varsel, 72-timers brudprocedure, privatlivspolitik, overførselsgrundlag) · helbredsdata kun til EU-modeller, håndhævet i ai-sdk · MDR: KAI er ikke medicinsk udstyr (besluttet) · AI Act: tydelig AI-markering, menneskelig godkendelse af udsendt AI-indhold · NIS2: ikke selv omfattet, men kontrolsættet dækker art. 21 for kunder der er.

Kontrolsæt K1–K15: identitet+MFA, mindste privilegium, hemmeligheder, kryptering, backup+gendannelsestest, logning, sårbarheder, ændringsstyring, hændelser, leverandørstyring, tenant-isolation, sletning, log-scrubbing, AI-routing-regel, awareness.

Underdatabehandler-udkast: Fly.io, Tigris, Mistral, DeepInfra, OpenRouter, Cloudflare, Simply.com, GitHub, Google, Apple/Microsoft/LinkedIn (login), AWS Lightsail, e-mail-afsendelse — alle med DPA og overførselsgrundlag uafklaret.

Trust-side: oversigt, kontroller, live underdatabehandler-liste, dokumenter, AI & data, produktsider, kontakt + security.txt, status.

Faser 0–5 og udløsere for betalt revision: se originalen.
