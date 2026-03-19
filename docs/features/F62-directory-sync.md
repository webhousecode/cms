# F62 — Directory Sync (AD / SCIM / External User Sources)

> Connect CMS users to external directories (Azure AD, Okta, Google Workspace) via SCIM, JIT provisioning, and directory API sync.

## Problem

CMS users are managed manually — created via invite (F01) or self-registration. Enterprises and agencies need:

1. **Automatic provisioning** — when an employee is added in Azure AD or Okta, they should appear in the CMS automatically
2. **Automatic deprovisioning** — when someone leaves the company, their CMS access must be revoked instantly (compliance requirement)
3. **Group → role mapping** — AD groups like "Content Editors" should map to CMS roles (admin/editor/viewer)
4. **Single source of truth** — the directory (AD, Okta, Google Workspace) owns user lifecycle, not the CMS
5. **No manual sync** — admins shouldn't have to re-invite users or manually manage two user lists

This is table stakes for enterprise SaaS. Notion, Slack, Figma, Linear, and Claude all offer SCIM provisioning on their enterprise tiers.

## Research: Industry Standard Methods

| Method | Direction | Real-time | Deprovision | Group sync | Complexity | Best for |
|--------|-----------|-----------|-------------|------------|------------|----------|
| **JIT (SAML/OIDC)** | On login | At login only | No (manual) | Limited | Low | MVP / SMB |
| **SCIM 2.0** | Push (IdP → CMS) | Near real-time | Yes (auto) | Yes | Medium-high | Enterprise |
| **Directory API pull** | Pull (CMS → IdP) | Periodic | Yes (on sync) | Yes | Medium | Supplementary |
| **LDAP/AD direct** | Pull | Periodic | Yes (on sync) | Yes | High (network) | On-prem only |

**Industry pattern (what Notion/Slack/Figma/Linear do):**
- Free/Pro: manual invite only
- Business: SSO (SAML) + JIT provisioning
- Enterprise: SCIM + group sync + role mapping

**Recommendation for webhouse.app:** Build in three tiers matching the product tiers.

## Solution

Three-tier directory integration, progressively more automated:

1. **Tier 1 — JIT Provisioning** (extends F50 Sign In Providers): Users auto-created on first SSO login with attributes from SAML/OIDC assertion. No deprovisioning — account persists but can't login if removed from IdP.

2. **Tier 2 — SCIM 2.0 Server**: The CMS exposes a SCIM API that identity providers (Azure AD, Okta, Google Workspace, OneLogin, JumpCloud) push user/group changes to in near real-time. Full lifecycle: create, update, deactivate, delete, group membership.

3. **Tier 3 — Directory API Sync** (optional enrichment): CMS periodically pulls from Microsoft Graph / Google Directory API for additional data (org structure, manager, department, photo). Supplements SCIM.

## Technical Design

### 1. JIT Provisioning (built into SSO flow)

Already partially described in F50. On SAML/OIDC callback:

```typescript
// packages/cms-admin/src/lib/auth-jit.ts

interface JitUserAttributes {
  email: string;
  name: string;
  groups?: string[];        // from SAML assertion or OIDC claims
  department?: string;
  avatarUrl?: string;
}

/**
 * Create or update user from SSO assertion attributes.
 * Maps IdP groups to CMS roles via site-configurable mapping.
 */
export async function jitProvision(attrs: JitUserAttributes, siteConfig: JitConfig): Promise<User> {
  const existing = await findUserByEmail(attrs.email);
  if (existing) {
    // Update attributes on every login (keep in sync)
    return updateUser(existing.id, {
      name: attrs.name,
      role: mapGroupToRole(attrs.groups, siteConfig.groupRoleMap),
    });
  }
  // Create new user
  return createUser(attrs.email, null /* no password */, attrs.name, {
    role: mapGroupToRole(attrs.groups, siteConfig.groupRoleMap),
    source: "sso-jit",
  });
}
```

### 2. SCIM 2.0 Server

Implement the SCIM 2.0 spec (RFC 7644) as API routes in the CMS admin:

```
# SCIM 2.0 Endpoints
GET    /api/scim/v2/ServiceProviderConfig    → capabilities
GET    /api/scim/v2/Schemas                  → user/group schema
GET    /api/scim/v2/ResourceTypes            → resource type definitions

# Users
GET    /api/scim/v2/Users                    → list users (with filter, pagination)
GET    /api/scim/v2/Users/:id                → get user
POST   /api/scim/v2/Users                    → create user
PUT    /api/scim/v2/Users/:id                → replace user
PATCH  /api/scim/v2/Users/:id                → update user (partial)
DELETE /api/scim/v2/Users/:id                → delete user

# Groups
GET    /api/scim/v2/Groups                   → list groups
GET    /api/scim/v2/Groups/:id               → get group
POST   /api/scim/v2/Groups                   → create group
PUT    /api/scim/v2/Groups/:id               → replace group
PATCH  /api/scim/v2/Groups/:id               → update group members
DELETE /api/scim/v2/Groups/:id               → delete group
```

**Authentication:** Bearer token per SCIM connection. Generated in Site Settings → Directory Sync tab. Stored in `_data/scim-config.json`.

**User schema mapping:**

```typescript
// packages/cms-admin/src/lib/scim/types.ts

// SCIM User → CMS User mapping
interface ScimUser {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"];
  id: string;                          // CMS user ID
  externalId: string;                  // IdP's user ID
  userName: string;                    // email
  name: { givenName: string; familyName: string };
  emails: Array<{ value: string; primary: boolean }>;
  active: boolean;                     // false = deactivated
  groups: Array<{ value: string; display: string }>;
  meta: { resourceType: "User"; created: string; lastModified: string };
}

// SCIM Group → CMS role/team mapping
interface ScimGroup {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"];
  id: string;
  displayName: string;                 // e.g. "Content Editors"
  members: Array<{ value: string; display: string }>;
}
```

**Group → Role mapping (configurable in Settings):**

```json
{
  "groupRoleMap": {
    "CMS Admins": "admin",
    "Content Editors": "editor",
    "Content Viewers": "viewer"
  },
  "defaultRole": "viewer"
}
```

**npm packages:**
- `scim2-parse-filter` — parse SCIM filter expressions (`userName eq "john@example.com"`)
- No SCIM server framework needed — the API is simple enough to implement with Next.js API routes

### 3. User Model Extension

```typescript
// Extend User in packages/cms-admin/src/lib/auth.ts

export interface User {
  // ...existing fields
  source?: "local" | "sso-jit" | "scim" | "invite";
  externalId?: string;          // IdP's user ID (for SCIM matching)
  directoryGroups?: string[];   // Groups from IdP (for display/audit)
  deactivatedAt?: string;       // SCIM sets this instead of deleting
  department?: string;          // From IdP attributes
  managerEmail?: string;        // From directory sync
}
```

### 4. Admin UI — Directory Sync Settings

New section in Site Settings → Team (or separate tab):

```
Site Settings → Directory Sync

CONNECTION
┌─────────────────────────────────────────────────┐
│ Status: ✅ Connected to Azure AD (Entra ID)     │
│ Last sync: 2 minutes ago                         │
│ Users synced: 47 │ Groups: 3                     │
│                                                  │
│ SCIM Endpoint:                                   │
│ https://cms.example/api/scim/v2                  │
│ Bearer Token: [●●●●●●●●●●] [Copy] [Regenerate] │
└─────────────────────────────────────────────────┘

GROUP → ROLE MAPPING
┌─────────────────────────────────────────────────┐
│ CMS Admins        → admin     [✎]              │
│ Content Editors   → editor    [✎]              │
│ Marketing Team    → editor    [✎]              │
│ Everyone          → viewer    [✎]              │
│                                                  │
│ Default role for unmapped groups: [viewer ▾]     │
│ [+ Add mapping]                                  │
└─────────────────────────────────────────────────┘

PROVISIONING LOG
┌─────────────────────────────────────────────────┐
│ ● 14:32 — Created user john@example.com (editor)│
│ ● 14:31 — Deactivated user old@example.com      │
│ ● 14:30 — Updated groups for jane@example.com   │
│ ● 13:15 — Created 12 users (initial sync)       │
└─────────────────────────────────────────────────┘
```

### 5. Directory API Sync (Tier 3 — optional enrichment)

```typescript
// packages/cms-admin/src/lib/directory-sync/microsoft-graph.ts

export class MicrosoftGraphSync {
  constructor(private tenantId: string, private clientId: string, private clientSecret: string) {}

  /** Pull users with delta query (only changes since last sync) */
  async syncUsers(deltaToken?: string): Promise<{ users: DirectoryUser[]; nextDeltaToken: string }>;

  /** Pull group memberships */
  async syncGroups(): Promise<DirectoryGroup[]>;

  /** Enrich CMS users with org data (department, manager, photo) */
  async enrichUser(email: string): Promise<EnrichmentData>;
}
```

Runs on a configurable schedule (default: every 30 minutes) via the existing scheduler infrastructure (F47/F60).

### 6. Storage

```
_data/scim-config.json          # SCIM bearer token, group-role map
_data/scim-log.jsonl            # Provisioning audit log (append-only)
_data/directory-sync.json       # Directory API sync state (delta tokens, schedule)
_data/users.json                # Extended with source, externalId, directoryGroups
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/auth-jit.ts` — new JIT provisioning module
- `packages/cms-admin/src/app/api/scim/v2/` — new SCIM 2.0 API routes
- `packages/cms-admin/src/lib/auth.ts` — extend User with `source`, `externalId`, `directoryGroups`
- `packages/cms-admin/src/lib/directory-sync/` — new directory sync modules
- `packages/cms-admin/package.json` — add `scim2-parse-filter`
- Site Settings — new Directory Sync tab

### Blast radius
- User model changes affect all auth-dependent code
- SCIM endpoints are a new public API surface — security critical
- Auto-provisioning could create unexpected users

### Breaking changes
- `User` interface extended with directory fields — optional, backwards-compatible

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] JIT provisioning creates user on first SSO login
- [ ] SCIM create/update/deactivate user works
- [ ] Group → role mapping assigns correct roles
- [ ] Deprovisioned users cannot log in

## Implementation Steps

### Phase 1 — JIT Provisioning (with F50)
1. Add `source`, `externalId`, `directoryGroups` to User model
2. Implement `jitProvision()` helper in auth module
3. Wire into F50's SAML/OIDC callback flow
4. Add group → role mapping config in Site Settings

### Phase 2 — SCIM 2.0 Server
5. Create `/api/scim/v2/` route group with auth middleware (Bearer token)
6. Implement `/ServiceProviderConfig`, `/Schemas`, `/ResourceTypes` discovery endpoints
7. Implement `/Users` CRUD with filter parsing (`scim2-parse-filter`)
8. Implement `/Groups` CRUD with member management
9. Wire SCIM user operations to CMS `createUser`/`updateUser`/deactivate
10. Add SCIM config UI in Site Settings (endpoint URL, token, group mapping)
11. Add provisioning log (JSONL)
12. Test with Azure AD and Okta SCIM provisioning

### Phase 3 — Directory API Sync (optional)
13. Implement Microsoft Graph sync with delta queries
14. Implement Google Directory API sync
15. Add sync schedule config and manual sync button
16. Add user enrichment (department, manager, photo)

## Dependencies

- **F01 (Invite Users)** — Done. User management infrastructure
- **F50 (Sign In Providers)** — SSO/SAML/OIDC login (JIT provisioning hooks into this)
- **F61 (Activity Log)** — SCIM operations logged to activity feed
- **F60 (Reliable Scheduled Tasks)** — for periodic directory API sync

## Effort Estimate

**Large** — 10-14 days total (phased)

- Phase 1 (JIT): 2 days — ships with F50
- Phase 2 (SCIM): 5-7 days — core enterprise feature
- Phase 3 (Directory sync): 3-5 days — supplementary enrichment

## Alternatives Considered

**WorkOS / Stytch** — managed SCIM service ($125+/connection/month). Normalizes all directory providers into a single webhook API. Eliminates need to implement SCIM server. Trade-off: external dependency + cost per customer. Good option if we want to ship fast and charge enterprise pricing.

**Build vs Buy decision:** For v1, build SCIM in-house (it's well-specified). If customer demand exceeds engineering capacity, consider WorkOS as an accelerator for Phase 2.
