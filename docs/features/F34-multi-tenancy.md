# F34 — Multi-Tenancy (Full)

> Complete multi-tenant architecture with hub-and-spoke model for managing distributed sites.

## Problem

The CMS admin currently manages sites as separate filesystem paths or GitHub repos. There is no true multi-tenant isolation, no central tenant provisioning, no usage metering, no billing hooks, and no white-label option. The current multi-site support is more like a site switcher than a real multi-tenancy system.

## Solution

A hub-and-spoke architecture where a central "hub" admin manages multiple tenant sites ("spokes"). Each tenant has isolated data, config, and storage. Includes tenant provisioning API, usage metering, billing hooks, white-label admin, and custom domains.

## Technical Design

### Hub Architecture

```
Hub (central admin)
├── Tenant Registry          # all tenants and their configs
├── Provisioning API         # create/update/delete tenants
├── Usage Metering           # track storage, API calls, AI tokens
├── Billing Hooks            # Stripe/Paddle webhooks
└── Site Pool (existing)     # manages active site connections

Spoke (tenant site)
├── Content Storage          # isolated per tenant
├── CMS Config               # per-tenant configuration
├── Admin UI                 # white-label with tenant branding
└── Domain Routing           # custom domain → tenant
```

### Tenant Data Model

```typescript
// packages/cms-admin/src/lib/tenancy/types.ts

export interface Tenant {
  id: string;
  name: string;
  slug: string;               // used in URLs: hub.webhouse.app/tenants/[slug]
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  plan: 'free' | 'pro' | 'enterprise';
  owner: {
    email: string;
    name: string;
    userId: string;
  };
  config: {
    storageAdapter: 'filesystem' | 'github' | 'sqlite';
    customDomain?: string;     // e.g. cms.client.com
    branding?: {
      logo?: string;
      primaryColor?: string;
      appName?: string;        // white-label name
    };
    limits: TenantLimits;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TenantLimits {
  maxDocuments: number;        // default: 1000 (free), unlimited (pro)
  maxCollections: number;      // default: 5 (free), unlimited (pro)
  maxStorageGb: number;        // default: 1 (free), 10 (pro)
  maxAiTokensPerMonth: number; // default: 100k (free), 1M (pro)
  maxUsers: number;            // default: 1 (free), 10 (pro)
}
```

### Usage Metering

```typescript
// packages/cms-admin/src/lib/tenancy/metering.ts

export interface UsageMeter {
  tenantId: string;
  period: string;              // e.g. "2026-03"
  documents: number;
  storageBytes: number;
  apiCalls: number;
  aiTokensInput: number;
  aiTokensOutput: number;
  aiCostUsd: number;
}

export class MeteringService {
  async record(tenantId: string, metric: string, value: number): Promise<void>;
  async getUsage(tenantId: string, period: string): Promise<UsageMeter>;
  async checkLimit(tenantId: string, metric: string): Promise<boolean>;
}
```

### Tenant Provisioning

```typescript
// packages/cms-admin/src/lib/tenancy/provisioning.ts

export class TenantProvisioner {
  /** Create a new tenant with isolated storage */
  async create(input: {
    name: string;
    ownerEmail: string;
    plan: Tenant['plan'];
    storageAdapter: 'filesystem' | 'github';
  }): Promise<Tenant>;

  /** Suspend a tenant (blocks API access, preserves data) */
  async suspend(tenantId: string): Promise<void>;

  /** Delete tenant and all data */
  async delete(tenantId: string): Promise<void>;

  /** Upgrade/downgrade plan */
  async changePlan(tenantId: string, plan: Tenant['plan']): Promise<void>;
}
```

### Domain Routing

```typescript
// packages/cms-admin/src/middleware.ts — extend

// Custom domain routing:
// 1. Request comes in for cms.client.com
// 2. Middleware looks up tenant by custom domain
// 3. Sets tenant context for the request
// 4. All subsequent operations are scoped to that tenant

export function resolveTenant(hostname: string): Tenant | null;
```

### Billing Hooks

```typescript
// packages/cms-admin/src/lib/tenancy/billing.ts

export interface BillingWebhookHandler {
  handleSubscriptionCreated(data: unknown): Promise<void>;
  handleSubscriptionUpdated(data: unknown): Promise<void>;
  handleSubscriptionCancelled(data: unknown): Promise<void>;
  handlePaymentFailed(data: unknown): Promise<void>;
}

// Supports Stripe and Paddle webhooks
```

### API Endpoints (Hub)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/tenants` | List tenants |
| `POST` | `/api/admin/tenants` | Create tenant |
| `GET` | `/api/admin/tenants/[id]` | Get tenant details |
| `PUT` | `/api/admin/tenants/[id]` | Update tenant |
| `POST` | `/api/admin/tenants/[id]/suspend` | Suspend tenant |
| `DELETE` | `/api/admin/tenants/[id]` | Delete tenant |
| `GET` | `/api/admin/tenants/[id]/usage` | Get usage metrics |
| `POST` | `/api/webhooks/stripe` | Stripe webhook |
| `POST` | `/api/webhooks/paddle` | Paddle webhook |

### White-Label Admin

The admin UI reads tenant branding config and applies:
- Custom logo in sidebar
- Custom primary color via CSS variables
- Custom app name in title bar
- Removal of "Webhouse" branding

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/tenancy/types.ts` — new tenant data models
- `packages/cms-admin/src/lib/tenancy/provisioning.ts` — new tenant CRUD
- `packages/cms-admin/src/lib/tenancy/metering.ts` — new usage tracking
- `packages/cms-admin/src/middleware.ts` — add tenant resolution from hostname
- `packages/cms-admin/src/lib/site-pool.ts` — extend for tenant isolation
- `packages/cms-admin/src/lib/site-registry.ts` — extend for tenant data
- `packages/cms-admin/src/app/admin/tenants/page.tsx` — new tenant management page

### Blast radius
- Middleware changes affect all request routing — critical to test thoroughly
- Site pool and registry changes affect core site management
- Tenant isolation must prevent data leakage between tenants

### Breaking changes
- `SiteEntry` interface extended with tenant fields
- Middleware adds tenant resolution step to all requests

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Tenant creation provisions isolated storage
- [ ] Custom domain routing resolves to correct tenant
- [ ] Usage metering tracks per-tenant correctly
- [ ] Limit enforcement blocks operations at quota
- [ ] Existing single-tenant setups continue working

## Implementation Steps

1. Create `packages/cms-admin/src/lib/tenancy/types.ts` with data models
2. Create `packages/cms-admin/src/lib/tenancy/provisioning.ts` with tenant CRUD
3. Create `packages/cms-admin/src/lib/tenancy/metering.ts` with usage tracking
4. Create tenant storage isolation: each tenant gets its own `dataDir` and `contentDir`
5. Update middleware to resolve tenant from hostname or URL path
6. Create tenant management API routes
7. Build tenant management page at `packages/cms-admin/src/app/admin/tenants/page.tsx` (hub only)
8. Add usage metering hooks to content API, AI calls, and storage
9. Implement limit enforcement (reject operations over quota)
10. Create Stripe webhook handler for billing
11. Implement white-label branding (read tenant config, apply CSS variables)
12. Add custom domain setup with SSL (Fly.io certificates)
13. Build tenant onboarding flow (sign up -> create tenant -> configure -> start)

## Dependencies

- Existing site pool in `packages/cms-admin/src/lib/site-pool.ts`
- Existing site registry in `packages/cms-admin/src/lib/site-registry.ts`
- F01 (Invite Users) — for per-tenant user management
- F25 (Storage Buckets) — for isolated media storage

## Effort Estimate

**Large** — 12-16 days
