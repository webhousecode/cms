- "How we build AI tools that actually work in production"
- "30 years of CMS lessons — why we rebuilt from scratch"
- "Why we chose fly.io over AWS for every client project"
- "React Native in 2025: what we've learned from 50+ app submissions"

Altså opinionated, teknisk, erfaring-drevet indhold. Ikke "10 tips to..."-clickbait. Det matcher profilen og ranker godt
på long-tail søgninger fra folk der faktisk køber software-udvikling.
   
- CMS Admin UI skal kunne lave en OAuth op mod GitHub, så det muligvis ikke er nødvendigt med en token, men at det enkelte website der anvender CMS bliver authenticated som en GH app og på den måde kan brugeren switche til at bruge GH som StorageAdapter. 

Du laver alle 3 og billeder gemmer du lokalt i første omgang indtil vi finder en storage løsning. Vi kunne jo lave vores
egen Bucket system på en fly.io maskine blot som en test og et midlertidigt asset til det. Men lokale billeder er ok mens
vi udvikler vi har jo lang vej endnu men tons af features. Vi er jo slet ikke kommet i gang med AI endnu hvor vi både skal
auto generere tekster, SEO og billeder. Og block-editor det skal vi også have det har jeg lovet en kunde
  
API - hvor er vi der - og en MCP server til CMS for at producere content fra en ekstern chat. Et must. 
Der skal ligeledes kunne installeres MCP servere til at lave/hente/søge efter indhold eller viden der skal bruges i content production. 

------ 
Hosting og site Access:

Hvordan connecter man en given cms admin til et site der skal administreres? Indtil videre har det jo været
      hardcodet fil connection, men det dur jo ikke når site er deployed et sted og cms admin måske et helt andet. De
      kører jo på forskellige porte og setups

    Det er et arkitekturspørgsmål der har flere lag:

    Problemet

    CMS admin og det site den administrerer er to separate processer. Lige nu deler de data via:
    - Fælles filsystem (filesystem adapter — content/ mappe)
    - Eller fælles SQLite fil

    Det virker lokalt og i Docker med shared volumes, men ikke når de er deployet separat.

    De tre modeller

    1. Same-host model (nuværende + Fly.io plan)

    Admin og site kører på samme server/container, deler et mounted volume:
    - /data/content/ — CMS data
    - /data/uploads/ — Media

    Site læser fra samme volume (enten direkte fra filsystem, eller via GitHub adapter). Det er den model vi går mod
    med Fly.io — én machine, to processer eller to containers med shared volume.

    2. GitHub adapter model

    Admin skriver til et GitHub repo (via GitHub adapter). Sitet deployes fra samme repo (Vercel/Netlify/Fly.io). Det
    er den klassiske headless CMS-model:

    Admin UI → commit til GitHub → site rebuilder/revaliderer

    GitHub adapter er allerede implementeret i @webhouse/cms. Det er den mest robuste decoupled løsning.

    3. API model (fremtidig)

    Admin eksponerer en REST API som sitet henter data fra. Sitet kalder admin's API i stedet for at læse filer
    direkte. Kræver auth + en egentlig "content API" — det er Phase 4+ (managed SaaS).

    Anbefaling til jer nu

    Fly.io deploy: Same-host model med persistent volume. Admin og webhouse-site kører begge på fly.io/arn, deler /data
     volume. Site læser content lokalt — ingen netværkskald, ingen latency.

    For fremtidige kunder på managed SaaS: GitHub adapter — admin committer, kunde-site deployes fra GitHub. Nul
    infrastruktur at vedligeholde per kunde.
	
	CMS admin bliver slutteligt et multi-tenant multi-site admin så en developer kan styre alle sine kunders websites fra 1 login. 
	
	
Din analyse er spot-on. Her er de tre modellers trade-offs i praksis:

  Same-host model (vores Fly.io plan)

  Admin og site kører på samme maskine med et shared persistent volume /data/. Det er simpelt, har nul latency på
  reads, og kræver ingen GitHub-integration. Ulempen: du kan ikke skalere admin og site uafhængigt, og du er bundet til
   Fly.io's persistent volumes (ikke S3-kompatible, ingen CDN).

  For webhouse.dk + cms-admin er dette den rigtige model nu — én Fly.io machine i arn, shared /data/content volume.

  GitHub adapter model (managed SaaS)

  Det er den klassiske decoupled headless CMS-tilgang. Admin committer ændringer til GitHub → sitet rebuilder via
  webhook (Vercel/Netlify trigger) eller revaliderer via on-demand ISR. Fordele: ingen server-til-server kommunikation,
   content er versioneret i Git, kunden ejer sit eget repo. Ulemper: der er delay (sekunder til minutter) fra save til
  live, og du kan ikke gøre preview uden en separat preview-deployment.

  GitHub adapteren er allerede implementeret i @webhouse/cms — det er den rigtige løsning til managed kunder.

  Multi-tenant admin (Phase 4+)

  Ideen om ét login til alle kunders sites er en hub-and-spoke model:
  - Hub: én admin-app med Supabase (kunder, sites, subscriptions, OAuth)
  - Spoke: én Fly.io machine per kunde (eller shared infra med silo-isolering)
  - Admin UI kender til alle spokes via en sites tabel — du switcher context og admin proxier mod den rigtige Fly.io
  machine/GitHub repo

  Det er en clean arkitektur. Hub bruger Supabase til sin egen state. Per-site data bor aldrig i hubben — det er altid
  i kundens silo (GitHub repo eller Fly.io volume).

  Anbefalet vej fremad:

  1. Nu: Fly.io deploy med same-host model — cms-admin + webhouse-site på én machine, shared /data/ volume
  2. Første kunde: GitHub adapter — admin hostet af jer, kunden deployer fra GitHub
  3. SaaS: Hub med Supabase + per-kunde Fly.io spokes, GitHub adapter som "sync-lag"
  
Fra Drupal:
Content Types (eg. Article (Posts), Pages, Products, Crops, Media, Retailer)

Clone content
Language ? 

  CMS komponenter — her er hvad der giver mest mening at tage næste:

  1. Video embed — [video:url] block eller et video field type (YouTube/Vimeo + native upload)
  2. Relations/references — et relation field der linker dokumenter på tværs af collections (f.eks. "related posts" på
  en artikel)
  3. Scheduled publishing — publishAt timestamp, cron-baseret auto-publish
  4. Revision history — gem tidligere versioner af et dokument, diff-view, restore
  5. Media library — samlet oversigt over alle uploadede filer på tværs af collections
  6. Horizontal Ruler
  7. Import (users, data, content)
  8. WP Migration - API/Admin user access to WP, and migrate ALL data to @cms. 

