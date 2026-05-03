# Sites Inventory

Snapshot af alle orgs og sites registreret i `~/.webhouse/cms-admin/registry.json`
(lokal cms-admin på `localhost:3010`). Kilde-tidspunkt: 2026-05-03.

**Kolonner:**
- **Adapter** — hvor cms-admin henter content fra (`filesystem` = lokal disk, `github` = git-backed)
- **Stack** — hvad selve sitet bygges/serveres med (ikke admin-tooling)
- **Domæne** — kendt produktions-URL hvor verificerbar; ellers `webhouse.app` (subdomain laves manuelt)

## webhouse — *WebHouse* (default org)

| Site (id) | Adapter | Stack | Domæne |
|---|---|---|---|
| webhouse.dk (`webhouse-site`) | filesystem | Next.js (TS) | webhouse.dk |
| webhouse.app (`landing`) | filesystem | Webhouse static builder (`tsx build.ts` via cms-cli) | webhouse.app + www|
| SproutLake (`sproutlake`) | github (`cbroberg/sproutlake`) | Next.js (TS) | sproutlake.sites.webhouse.app |
| CMS Docs (`cms-docs`) | filesystem | Next.js (TS) | docs.webhouse.app |
| Sanne Andersen (`sanneandersen`) | filesystem | Next.js (TS) + Drizzle, Fly.io deploy | sanneandersen.dk |

## broberg-ai — *BROBERG-AI*

| Site (id) | Adapter | Stack | Domæne |
|---|---|---|---|
| trail-landing (`trail`) | filesystem | Webhouse static builder | trailmem.com + www |

## aallm — *AALLM*

*Ingen sites.*

## christian-broberg — *Christian Broberg*

| Site (id) | Adapter | Stack | Domæne |
|---|---|---|---|
| Bridgeberg (`bridgeberg`) | filesystem | Webhouse static builder | bridgeberg.webhouse.app |

## examples — *Examples*

| Site (id) | Adapter | Stack | Domæne |
|---|---|---|---|
| Simple Blog (`simple-blog`) | filesystem | Webhouse static builder (cms-cli dev/build) | simple.examples.webhouse.app |
| Elina Voss (`elina-voss-portfolio`) | filesystem | Webhouse static builder | elinavoss.examples.webhouse.app |
| Freelancer (`freelancer`) | filesystem | Webhouse static builder | freelancer.examples.webhouse.app |
| Meridian Studio (`meridian-studio`) | filesystem | Webhouse static builder | meridian.examples.webhouse.app |
| Boutique (`boutique`) | filesystem | Webhouse static builder | boutique.examples.webhouse.app |
| Elena Vasquez (`portfolio`) | filesystem | Webhouse static builder | elenavasquez.examples.webhouse.app |
| Thinking in Pixels (`blog`) | filesystem | Webhouse static builder | pixels.examples.webhouse.app |
| Maurseth (`maurseth`) | filesystem | Webhouse static builder (`tsx build.ts` + sirv) | maurseth.sites.webhouse.app |
| Vercel (`next-js-boilerplate-vercel`) | github (`webhousecode/nextjs-boilerplate`) | Next.js (TS) | nextjs-boilerplate-1x3txthik-webhhouse.vercel.app |
| CMS Demo (`cms-demo`) | filesystem | Webhouse static builder | demo.webhouse.app |
| Agentic CMS Demo (`agentic-cms-demo`) | filesystem | Webhouse static builder | agentic-demo.webhouse.app |
| Netlify (`nextjs-boilerplate-netlify`) | github (`webhousecode/nextjs-boilerplate`) | Next.js (TS) | webhouse-nextjs-boilerplate.netlify.app |

## frameworks — *Frameworks* (F125 consumer-eksempler)

| Site (id) | Adapter | Stack | Domæne |
|---|---|---|---|
| .NET 10 (Razor Pages) (`dotnet-blog`) | filesystem | .NET 10 / Razor Pages (C#) | net10.frameworks.webhouse.app |
| Java (Spring Boot) (`java-spring-blog`) | filesystem | Java / Spring Boot | java.frameworks.webhouse.app |
| Go (Gin) (`go-gin-blog`) | filesystem | Go / Gin | go.frameworks.webhouse.app |
| Python (Django 5) (`django-blog`) | filesystem | Python / Django 5 | python.frameworks.webhouse.app |
| Ruby (Sinatra) (`ruby-blog`) | filesystem | Ruby / Sinatra (Rails-compat) | ruby.frameworks.webhouse.app |
| PHP (Laravel) (`php-blog`) | filesystem | PHP / Laravel-compat | php.frameworks.webhouse.app |
| Astro 5 (`astro-blog`) | filesystem | Astro 5 (TS) | astro5.frameworks.webhouse.app |
| SvelteKit (`sveltekit-blog`) | filesystem | SvelteKit / Svelte 5 (TS) | svelte.frameworks.webhouse.app |
| Hugo (`hugo-blog`) | filesystem | Hugo (Go SSG) | hugo.frameworks.webhouse.app |
| Rust (Axum) (`rust-axum-blog`) | filesystem | Rust / Axum + Tokio | rust.frameworks.webhouse.app |
| Elixir (Plug) (`elixir-blog`) | filesystem | Elixir / Plug (Phoenix-compat) | elixir.frameworks.webhouse.app |
| Swift (Vapor) (`swift-vapor-blog`) | filesystem | Swift / Vapor 4 | swift.frameworks.webhouse.app |

## sanne-andersen — *Sanne Andersen*

*Ingen sites* (org-duplikat — det aktive Sanne-site ligger under `webhouse`). (sanneandersen.dk skal flyttes til denne org)

---

## Opsummering

- **7 orgs** (2 tomme: `aallm`, `sanne-andersen`)
- **30 sites** total
  - 5 Next.js på filesystem-adapter
  - 2 Next.js på github-adapter (Vercel/Netlify boilerplates)
  - 11 Webhouse static builder-sites
  - 12 framework-consumer-eksempler (F125)
- **5 sites med ikke-template domæne:** webhouse.dk, webhouse.app, docs.webhouse.app, sanneandersen.dk, trailmem.com
- **2 sites på preview-hosting:** vercel.app + netlify.app (auto-genererede URLs)
- **23 templates → `webhouse.app` subdomains** (laves manuelt)
