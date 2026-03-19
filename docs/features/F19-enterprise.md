# F19 — Enterprise Features

> Multi-user roles, approval workflows, granular permissions, audit logs, and SSO.

## Problem

The CMS lacks enterprise-grade access control. There are no approval workflows (content goes directly from draft to published), no audit logs, no SSO, and no granular per-collection permissions.

## Solution

A comprehensive enterprise feature set: extended roles, approval workflows with review states, per-collection permissions, full audit logging, and SSO (SAML/OIDC).

## Technical Design

### Extended Roles & Permissions

```typescript
// packages/cms-admin/src/lib/permissions.ts

export type Role = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer';

export interface Permission {
  collection: string | '*';  // '*' = all collections
  actions: Array<'create' | 'read' | 'update' | 'delete' | 'publish' | 'review'>;
}

export interface RoleConfig {
  role: Role;
  permissions: Permission[];
}

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [{ collection: '*', actions: ['create', 'read', 'update', 'delete', 'publish', 'review'] }],
  admin: [{ collection: '*', actions: ['create', 'read', 'update', 'delete', 'publish', 'review'] }],
  editor: [{ collection: '*', actions: ['create', 'read', 'update'] }],
  reviewer: [{ collection: '*', actions: ['read', 'review'] }],
  viewer: [{ collection: '*', actions: ['read'] }],
};

export function hasPermission(user: User, collection: string, action: string): boolean;
```

### Approval Workflow

```typescript
// Extended DocumentStatus
export type DocumentStatus = 'draft' | 'in-review' | 'approved' | 'published' | 'archived';

// packages/cms-admin/src/lib/workflow.ts
export interface ReviewRequest {
  id: string;
  documentId: string;
  collection: string;
  requestedBy: string;       // user ID
  reviewers: string[];       // user IDs
  status: 'pending' | 'approved' | 'rejected' | 'changes-requested';
  comments: Array<{
    userId: string;
    text: string;
    createdAt: string;
  }>;
  createdAt: string;
  resolvedAt?: string;
}
```

### Audit Log

```typescript
// packages/cms-admin/src/lib/audit-log.ts

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;             // e.g. 'document.create', 'settings.update', 'user.invite'
  resource: string;           // e.g. 'posts/hello-world'
  details?: Record<string, unknown>;
  ip?: string;
}

export class AuditLog {
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;
  async query(options: {
    userId?: string;
    action?: string;
    resource?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditEntry[]>;
}
```

Stored at `<dataDir>/audit-log.jsonl` (append-only).

### SSO

```typescript
// packages/cms-admin/src/lib/sso.ts

export interface SsoConfig {
  provider: 'saml' | 'oidc';
  saml?: {
    entryPoint: string;
    issuer: string;
    cert: string;
    callbackUrl: string;
  };
  oidc?: {
    clientId: string;
    clientSecret: string;
    issuerUrl: string;       // e.g. https://accounts.google.com
    callbackUrl: string;
  };
  autoProvision: boolean;    // auto-create user on first login
  defaultRole: Role;
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/reviews` | Submit for review |
| `PUT` | `/api/admin/reviews/[id]` | Approve/reject |
| `GET` | `/api/admin/reviews` | List pending reviews |
| `GET` | `/api/admin/audit` | Query audit log |
| `GET` | `/api/auth/saml/login` | SAML login redirect |
| `POST` | `/api/auth/saml/callback` | SAML ACS callback |
| `GET` | `/api/auth/oidc/login` | OIDC login redirect |
| `GET` | `/api/auth/oidc/callback` | OIDC callback |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/permissions.ts` — new RBAC module
- `packages/cms-admin/src/lib/workflow.ts` — new review request system
- `packages/cms-admin/src/lib/audit-log.ts` — new audit logger
- `packages/cms-admin/src/lib/sso.ts` — new SSO module
- `packages/cms-admin/src/lib/auth.ts` — extend User with role and permissions
- `packages/cms-admin/src/middleware.ts` — add permission checks
- `packages/cms/src/storage/types.ts` — add `in-review`/`approved` to DocumentStatus

### Blast radius
- DocumentStatus type change affects all code reading/writing document status
- Middleware permission checks affect all protected routes
- Audit logging adds write overhead to every mutation

### Breaking changes
- `DocumentStatus` gains new values — existing status checks need updating
- `User` interface gains `permissions` array

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Role-based access controls block unauthorized actions
- [ ] Review workflow: submit → approve/reject cycle works
- [ ] Audit log records all mutations
- [ ] OIDC login flow completes successfully

## Implementation Steps

1. Create `packages/cms-admin/src/lib/permissions.ts` with role-based access control
2. Add `role` and `permissions` to `User` interface
3. Add `in-review` and `approved` to `DocumentStatus`
4. Create `packages/cms-admin/src/lib/workflow.ts` with review request CRUD
5. Create `packages/cms-admin/src/lib/audit-log.ts` with JSONL append logging
6. Add audit logging middleware that captures all API mutations
7. Build review workflow UI: "Submit for Review" button, review panel with comments
8. Build audit log viewer at `packages/cms-admin/src/app/admin/settings/audit/page.tsx`
9. Create permission check middleware for API routes
10. Implement OIDC login flow using `openid-client` npm package
11. Implement SAML login flow using `samlify` npm package
12. Build SSO configuration page in admin settings
13. Import adapters for Contentful, Sanity, and Strapi (separate from F02 generic import)

## Dependencies

- F01 (Invite Users) — for basic role system (this extends it)

## Effort Estimate

**Large** — 10-14 days
