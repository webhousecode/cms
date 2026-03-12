# @webhouse/cms — Admin UI & Deployment Plan

## Fase A: cms-admin pakke ← NU
**Pakke:** `packages/cms-admin/` — selvstændig Next.js 16 App Router app
**Stack:** Next.js 16 + TipTap + Tailwind v4 + shadcn-inspireret design system

### Routing
```
/admin                          → Dashboard (collection overview + stats)
/admin/[collection]             → Document list
/admin/[collection]/[slug]      → Document editor
```

### API routes
```
POST   /api/cms/[collection]          → createDocument
PATCH  /api/cms/[collection]/[slug]   → updateDocument (data + status)
DELETE /api/cms/[collection]/[slug]   → deleteDocument
```

### Field types → UI komponenter
| Type       | Komponent        |
|------------|-----------------|
| text       | `<input>`       |
| textarea   | `<textarea>`    |
| richtext   | TipTap editor   |
| date       | `<input date>`  |
| boolean    | Toggle switch   |
| select     | `<select>`      |
| tags       | Chip input      |
| number     | `<input number>`|

### Multi-player v1 — Optimistic locking (bygger på AI Lock)
- Når bruger A åbner et dokument: PATCH `_lock: { userId, lockedAt }` i `_fieldMeta`
- Bruger B ser "Redigeres af [navn]" banner + alle felter read-only
- Lock frigives: ved save, ved luk, eller efter 10 min inaktivitet (timeout)
- Lock-check API: `GET /api/cms/[collection]/[slug]/lock`
- WebSocket-polling hvert 30s for at holde lock i live

### Multi-player v2 (Phase 4+)
- Partykit eller Ably for real-time presence
- Yjs CRDT for konfliktfri merge
- Live cursor / field highlight per bruger

---

## Fase B: Docker
**Dockerfile** — single container
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY packages/cms-admin ./
RUN pnpm install --frozen-lockfile && pnpm build
EXPOSE 3010
CMD ["pnpm", "start"]
```

**docker-compose.yml** — til lokal udvikling
```yaml
services:
  cms-admin:
    image: webhouse/cms-admin:latest
    ports:
      - "3010:3010"
    volumes:
      - ./content:/app/content        # CMS content
      - ./cms.config.js:/app/cms.config.js  # Project config
    environment:
      - CMS_CONFIG_PATH=/app/cms.config.js
      - CMS_ADMIN_SECRET=change-me
```

**Test targets:**
- Docker Desktop (macOS) ← Christian tester
- Ubuntu laptop ← Christian tester
- Fly.io (region: arn)

---

## Fase C: Fly.io single-tenant (developer self-hosted)
Developer deployer sin egen instans:
```bash
fly launch --image webhouse/cms-admin
fly volumes create cms_data --region arn --size 1
```

**fly.toml:**
```toml
app = "my-cms-admin"
primary_region = "arn"

[build]
  image = "registry.fly.io/webhouse/cms-admin"

[mounts]
  source = "cms_data"
  destination = "/app/content"

[env]
  CMS_CONFIG_PATH = "/app/cms.config.js"
  PORT = "8080"

[[services]]
  internal_port = 8080
  protocol = "tcp"
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

**Pris:** ~$3-5/month for en nano machine der sover når idle.

---

## Fase D: Managed SaaS ($9/month) — WebHouse som operator

### Arkitektur: Silo-model
```
customer-a.cms.webhouse.app  →  Fly.io machine A (sleeps when idle)
customer-b.cms.webhouse.app  →  Fly.io machine B (sleeps when idle)
                                  ↓
                            persistent volume (1GB)
                            SQLite + content/
                                  ↓
                            GitHub adapter
                            synker til kundens repo automatisk
```

### Hub-app (separat service — webhouse.app)
- Next.js app med Stripe integration
- Kunde tilmelder sig → Stripe webhook → provision Fly.io machine + volume
- Kunde forbinder GitHub repo via OAuth
- Dashboard: se status, skift plan, restart instans
- Hub-appens egen database: **Supabase** (kunder, subscriptions, machines, billing)

### Pricing tiers (forslag)
| Plan     | Pris    | Collections | Brugere | Lagerplads |
|----------|---------|-------------|---------|------------|
| Starter  | $9/md   | 5           | 1       | 1 GB       |
| Pro      | $29/md  | Ubegrænset  | 5       | 10 GB      |
| Agency   | $99/md  | Ubegrænset  | 25      | 50 GB      |

---

## Docs der skal skrives (før release)
- [ ] `docs/docker.md` — lokal Docker setup + docker-compose
- [ ] `docs/fly-io.md` — self-hosted Fly.io deploy (trin for trin)
- [ ] `docs/managed.md` — connect til webhouse.app managed service
- [ ] `docs/multi-player.md` — how locking works, v1 vs v2

---

## Rækkefølge
```
✅ Fase A.1 — Pakkestruktur, routing, dashboard, collection list
🔜 Fase A.2 — Document editor færdig + alle field types testet
🔜 Fase A.3 — Multi-player v1 (optimistic locking)
🔜 Fase A.4 — cms-cli: `cms admin` kommando starter admin UI
🔜 Fase B   — Dockerfile + docker-compose + test på Docker Desktop + Ubuntu
🔜 Fase C   — Fly.io single-tenant deploy (webhouse-site admin)
🔜 Fase D   — Hub-app + Stripe + managed multi-tenant SaaS
```
