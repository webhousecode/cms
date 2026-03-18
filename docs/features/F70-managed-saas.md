# F70 — Managed SaaS Hub App

> The commercial offering: webhouse.app — a managed CMS-as-a-Service where customers sign up, pay via Stripe, and get auto-provisioned isolated CMS instances on Fly.io with persistent storage and GitHub sync.

## Problem

The CMS currently requires self-hosting: clone the repo, configure cms.config.ts, run locally or deploy your own Docker/Fly.io instance. This works for developers but excludes non-technical users and small agencies who want a managed solution. There is no recurring revenue model, no customer management, and no way to offer the CMS as a service to multiple clients from a single control plane.

## Solution

A hub application at `webhouse.app` built with Next.js + Stripe + Supabase that acts as the management plane for a silo-model multi-tenant architecture. Each customer gets their own isolated Fly.io machine with a persistent volume — no shared databases, no noisy-neighbor problems. Machines sleep when idle to minimize costs.

Customer flow: sign up on webhouse.app -> choose a pricing tier -> Stripe payment -> auto-provision a Fly.io machine + volume -> connect their GitHub repo via OAuth -> their CMS is live at `{customer}.cms.webhouse.app`.

The hub handles billing, provisioning, monitoring, and self-service plan management. The individual CMS instances are standard `@webhouse/cms-admin` deployments with no awareness of the hub beyond a license check.

## Technical Design

### 1. Architecture Overview

```
webhouse.app (Hub — Next.js + Supabase)
  ├── Sign up / login (Supabase Auth)
  ├── Stripe subscription management
  ├── Customer dashboard
  ├── Machine provisioning via Fly.io API
  └── Health monitoring

customer-a.cms.webhouse.app  →  Fly.io machine A (sleeps when idle)
                                  ├── persistent volume (1-50GB)
                                  ├── SQLite + content/
                                  └── GitHub adapter → customer's repo

customer-b.cms.webhouse.app  →  Fly.io machine B (sleeps when idle)
                                  ├── persistent volume (1-50GB)
                                  ├── SQLite + content/
                                  └── GitHub adapter → customer's repo
```

### 2. Hub App Structure

```
apps/hub/                          # Separate repo: webhousecode/webhouse-app
  ├── package.json
  ├── next.config.ts
  ├── fly.toml                     # Hub deploys to arn region
  ├── src/
  │   ├── app/
  │   │   ├── page.tsx             # Landing page / marketing
  │   │   ├── auth/
  │   │   │   ├── sign-up/page.tsx
  │   │   │   ├── sign-in/page.tsx
  │   │   │   └── callback/route.ts
  │   │   ├── dashboard/
  │   │   │   ├── page.tsx         # Customer overview: status, plan, usage
  │   │   │   ├── instances/
  │   │   │   │   ├── page.tsx     # List CMS instances
  │   │   │   │   └── [id]/page.tsx # Instance detail: restart, logs, config
  │   │   │   ├── billing/
  │   │   │   │   └── page.tsx     # Plan management, invoices, upgrade/downgrade
  │   │   │   ├── team/
  │   │   │   │   └── page.tsx     # Manage team members (per plan limit)
  │   │   │   └── github/
  │   │   │       └── page.tsx     # Connect GitHub repo via OAuth
  │   │   └── api/
  │   │       ├── webhooks/
  │   │       │   └── stripe/route.ts   # Stripe webhook handler
  │   │       ├── machines/
  │   │       │   ├── provision/route.ts # Create Fly.io machine + volume
  │   │       │   ├── [id]/
  │   │       │   │   ├── start/route.ts
  │   │       │   │   ├── stop/route.ts
  │   │       │   │   ├── restart/route.ts
  │   │       │   │   └── status/route.ts
  │   │       │   └── health/route.ts    # Health check all machines
  │   │       └── usage/
  │   │           └── route.ts           # Usage metering endpoint
  │   ├── lib/
  │   │   ├── supabase/
  │   │   │   ├── client.ts
  │   │   │   ├── server.ts
  │   │   │   └── middleware.ts
  │   │   ├── stripe/
  │   │   │   ├── client.ts
  │   │   │   ├── plans.ts             # Plan definitions + limits
  │   │   │   └── webhooks.ts          # Webhook event handlers
  │   │   ├── fly/
  │   │   │   ├── client.ts            # Fly.io Machines API wrapper
  │   │   │   ├── provision.ts         # Create machine + volume + DNS
  │   │   │   ├── deprovision.ts       # Destroy machine + volume (with confirmation)
  │   │   │   └── scale.ts             # Upgrade/downgrade machine specs
  │   │   └── github/
  │   │       └── oauth.ts             # GitHub OAuth flow for repo connection
  │   └── types/
  │       └── index.ts
  └── supabase/
      └── migrations/
          ├── 001_customers.sql
          ├── 002_subscriptions.sql
          ├── 003_machines.sql
          └── 004_usage_events.sql
```

### 3. Supabase Database Schema (Hub)

```sql
-- customers
create table customers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text,
  auth_user_id  uuid references auth.users(id),
  stripe_customer_id text unique,
  created_at    timestamptz default now()
);

-- subscriptions
create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid references customers(id) on delete cascade,
  stripe_subscription_id text unique,
  plan                  text not null check (plan in ('starter', 'pro', 'agency')),
  status                text not null check (status in ('active', 'past_due', 'canceled', 'trialing')),
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  created_at            timestamptz default now()
);

-- machines (one per CMS instance)
create table machines (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id) on delete cascade,
  subscription_id uuid references subscriptions(id),
  fly_app_id      text unique not null,
  fly_machine_id  text unique not null,
  fly_volume_id   text,
  region          text default 'arn',
  subdomain       text unique not null,   -- {subdomain}.cms.webhouse.app
  custom_domain   text unique,
  github_repo     text,                   -- owner/repo
  github_token    text,                   -- encrypted OAuth token
  status          text default 'provisioning' check (status in ('provisioning', 'running', 'sleeping', 'stopped', 'error')),
  specs           jsonb default '{"cpu": 1, "memory_mb": 256, "volume_gb": 1}',
  created_at      timestamptz default now()
);

-- usage_events (for metering)
create table usage_events (
  id          uuid primary key default gen_random_uuid(),
  machine_id  uuid references machines(id) on delete cascade,
  event_type  text not null check (event_type in ('storage_bytes', 'api_calls', 'ai_tokens', 'build_minutes')),
  value       bigint not null,
  recorded_at timestamptz default now()
);
```

### 4. Pricing Tiers

```typescript
// apps/hub/src/lib/stripe/plans.ts
export const plans = {
  starter: {
    name: 'Starter',
    priceMonthly: 900,              // $9/mo in cents
    stripePriceId: process.env.STRIPE_PRICE_STARTER!,
    limits: {
      collections: 5,
      users: 1,
      storageGb: 1,
      aiTokensPerMonth: 100_000,
      customDomain: false,
    },
    flySpecs: { cpu: 1, memory_mb: 256, volume_gb: 1 },
  },
  pro: {
    name: 'Pro',
    priceMonthly: 2900,             // $29/mo
    stripePriceId: process.env.STRIPE_PRICE_PRO!,
    limits: {
      collections: -1,              // Unlimited
      users: 5,
      storageGb: 10,
      aiTokensPerMonth: 1_000_000,
      customDomain: true,
    },
    flySpecs: { cpu: 1, memory_mb: 512, volume_gb: 10 },
  },
  agency: {
    name: 'Agency',
    priceMonthly: 9900,             // $99/mo
    stripePriceId: process.env.STRIPE_PRICE_AGENCY!,
    limits: {
      collections: -1,
      users: 25,
      storageGb: 50,
      aiTokensPerMonth: 10_000_000,
      customDomain: true,
    },
    flySpecs: { cpu: 2, memory_mb: 1024, volume_gb: 50 },
  },
} as const;
```

### 5. Provisioning Flow

```
1. Customer completes Stripe Checkout
2. Stripe webhook: checkout.session.completed
   -> Create customer + subscription in Supabase
3. Stripe webhook: customer.subscription.created
   -> Trigger provisioning:
      a. Create Fly.io app: fly-api POST /v1/apps { app_name: "cms-{subdomain}", org: "webhouse" }
      b. Create volume: POST /v1/apps/{app}/volumes { region: "arn", size_gb: plan.volume_gb }
      c. Create machine: POST /v1/apps/{app}/machines {
           region: "arn",
           config: {
             image: "registry.fly.io/webhouse-cms-admin:latest",
             guest: { cpus: plan.cpu, memory_mb: plan.memory_mb },
             mounts: [{ volume: volume_id, path: "/app/content" }],
             env: {
               CMS_LICENSE_KEY: generated_key,
               CMS_INSTANCE_ID: machine.id,
               HUB_CALLBACK_URL: "https://webhouse.app/api/machines/health",
             },
             auto_destroy: false,
             restart: { policy: "on-failure" },
             services: [{ ports: [{ port: 443, handlers: ["tls", "http"] }], internal_port: 3010 }],
           }
         }
      d. Configure DNS: {subdomain}.cms.webhouse.app -> Fly.io app
      e. Update machine record: status -> 'running'
4. Customer sees CMS instance live at {subdomain}.cms.webhouse.app
```

### 6. Deprovision Flow

```
Stripe webhook: customer.subscription.deleted
  -> Grace period: 7 days (machine kept alive but read-only)
  -> After grace period:
     a. Export content to GitHub (if connected) — final backup
     b. Destroy Fly.io machine
     c. Destroy Fly.io volume
     d. Update machine record: status -> 'stopped'
     e. Keep customer data in Supabase for 90 days (reactivation window)
```

### 7. Machine Management API (Fly.io)

```typescript
// apps/hub/src/lib/fly/client.ts
export class FlyClient {
  constructor(private token: string, private org: string) {}

  async createApp(name: string): Promise<FlyApp>;
  async createVolume(appId: string, region: string, sizeGb: number): Promise<FlyVolume>;
  async createMachine(appId: string, config: MachineConfig): Promise<FlyMachine>;
  async startMachine(appId: string, machineId: string): Promise<void>;
  async stopMachine(appId: string, machineId: string): Promise<void>;
  async restartMachine(appId: string, machineId: string): Promise<void>;
  async getMachineStatus(appId: string, machineId: string): Promise<MachineStatus>;
  async destroyMachine(appId: string, machineId: string): Promise<void>;
  async destroyVolume(appId: string, volumeId: string): Promise<void>;
  async extendVolume(appId: string, volumeId: string, newSizeGb: number): Promise<void>;
}
```

### 8. Custom Domains

- Default: `{subdomain}.cms.webhouse.app` (wildcard DNS on `*.cms.webhouse.app`)
- Custom: customer adds CNAME record pointing to Fly.io app
- SSL: Fly.io automatic Let's Encrypt certificates
- Pro and Agency plans only

### 9. Usage Metering

Each CMS instance periodically reports usage to the hub:

```
CMS instance -> POST https://webhouse.app/api/usage
{
  instance_id: "...",
  storage_bytes: 524288000,
  api_calls_24h: 1247,
  ai_tokens_24h: 45000,
}
```

Hub checks against plan limits. Overage: soft limit (warning email at 80%), hard limit (read-only at 100% for storage, rate-limited for API/AI).

### 10. Customer Dashboard Features

- **Status**: machine state (running/sleeping/error), uptime, last activity
- **Plan**: current tier, usage vs limits, upgrade/downgrade buttons
- **Restart**: one-click machine restart
- **GitHub**: connect/disconnect repo, sync status
- **Team**: invite/remove team members (up to plan limit)
- **Billing**: invoices, payment method, plan change history
- **Custom domain**: add/verify custom domain (Pro/Agency)

## Implementation Steps

### Phase 1 — Hub App Scaffold + Stripe (days 1-4)
1. Create hub app repo with Next.js 16 + Supabase + Tailwind v4 + shadcn
2. Set up Supabase project (Frankfurt/Stockholm region) with auth + database
3. Create database migrations: customers, subscriptions, machines, usage_events
4. Implement Supabase Auth (email + password, later OAuth)
5. Configure Stripe products and prices for Starter/Pro/Agency
6. Build Stripe Checkout integration for sign-up flow
7. Implement Stripe webhook handlers: subscription created/updated/deleted

### Phase 2 — Fly.io Provisioning (days 5-8)
8. Build Fly.io Machines API client wrapper
9. Implement provisioning pipeline: create app -> volume -> machine -> DNS
10. Implement deprovision pipeline with 7-day grace period
11. Build machine management: start/stop/restart/status
12. Set up wildcard DNS for `*.cms.webhouse.app`
13. Build CMS admin Docker image with license check + hub callback
14. Test full provisioning flow: Stripe payment -> live CMS instance

### Phase 3 — Customer Dashboard (days 9-13)
15. Build dashboard layout with status overview
16. Implement instance management page: status, restart, logs
17. Build billing page: plan display, upgrade/downgrade via Stripe Customer Portal
18. Implement GitHub OAuth flow for repo connection
19. Build team management: invite/remove users per plan limit
20. Implement usage metering endpoint + plan limit enforcement

### Phase 4 — Custom Domains + Polish (days 14-17)
21. Implement custom domain flow: CNAME verification + Fly.io certificate
22. Build health monitoring: periodic machine status checks
23. Implement overage warnings (email at 80% usage)
24. Build admin-only hub management view (all customers, all machines)
25. Load testing: provision/deprovision cycles, machine sleep/wake latency

### Phase 5 — Launch Preparation (days 18-20)
26. Landing page / marketing site at webhouse.app
27. Documentation: getting started, plan comparison, FAQ
28. Set up monitoring + alerting (Fly.io metrics, Stripe webhook failures)
29. Security audit: auth flows, webhook verification, API authorization
30. Soft launch with beta customers

## Dependencies

- **F34 — Multi-Tenancy** — required for tenant isolation patterns in CMS instances
- **F12 — One-Click Publish** — required for automated deployment of CMS instances
- **F01 — Invite Users (Done)** — required for team member management per instance
- **Stripe account** — billing and subscription management
- **Supabase project** — hub database and authentication
- **Fly.io organization** — machine provisioning and orchestration
- **DNS** — wildcard record for `*.cms.webhouse.app`

## Effort Estimate

**XL** — 15-20 days

- Phase 1 (hub + Stripe): 4 days
- Phase 2 (Fly.io provisioning): 4 days
- Phase 3 (customer dashboard): 5 days
- Phase 4 (custom domains + polish): 4 days
- Phase 5 (launch prep): 3 days
