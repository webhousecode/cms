TECH:
	
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

Orchestrator scheduling: Skal agenter køre som en persistent background worker (kraftigere, kan køre 24/7) eller som Next.js
cron/API routes (simplere, kører kun når serveren er oppe)?

  1. Next.js cron routes (Anbefalet)
     Simplere arkitektur. Scheduling via instrumentation.ts (som vi allerede bruger til publishAt). Kører kun når
     admin-serveren kører. Nemmere at deploye.
  2. Persistent worker process
     Separat Node.js process der kører 24/7. Kraftigere, kan køre uafhængigt af admin UI. Men kræver process management
     (PM2/systemd) og er mere komplekst at deploye.
❯ 3. Hybrid
     Start med Next.js cron, men arkitektér orchestratoren så den kan flyttes til en worker senere. Best of both worlds, men
     kræver lidt ekstra abstraktionslag.

