# F01 — Invite Users

> Invite editors and collaborators to a site via email with role-based access control.

## Problem

Today the CMS has a single-user auth model stored in `users.json`. There is no way to invite additional editors, assign roles, or manage permissions. Multi-person teams must share a single login.

## Solution

Add an invitation system with role-based access. Admins generate invite links (with expiry tokens) that new users can use to create accounts. Each user gets a role (`admin`, `editor`, `viewer`) that controls what they can do.

## Technical Design

### Data Models

```typescript
// packages/cms-admin/src/lib/auth.ts — extend User
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt: string;
  invitedBy?: string; // user ID of inviter
  zoom?: number;
}

// New file: packages/cms-admin/src/lib/invitations.ts
export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  token: string; // crypto.randomUUID()
  expiresAt: string; // ISO timestamp, 7 days from creation
  createdBy: string; // user ID
  createdAt: string;
  acceptedAt?: string;
}
```

Stored at `<dataDir>/invitations.json`.

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/invitations` | Admin | Create invitation |
| `GET` | `/api/admin/invitations` | Admin | List pending invitations |
| `DELETE` | `/api/admin/invitations/[id]` | Admin | Revoke invitation |
| `GET` | `/api/admin/invitations/validate?token=...` | Public | Validate token, return email+role |
| `POST` | `/api/admin/invitations/accept` | Public | Accept invite, create account |

### Key Components

- `packages/cms-admin/src/lib/invitations.ts` — CRUD for invitation records
- `packages/cms-admin/src/app/api/admin/invitations/route.ts` — API routes
- `packages/cms-admin/src/app/admin/settings/team/page.tsx` — Team management UI
- `packages/cms-admin/src/app/invite/[token]/page.tsx` — Public accept page
- `packages/cms-admin/src/middleware.ts` — Add role-based route guards

### Role Permissions

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| Create/edit documents | Yes | Yes | No |
| Delete documents | Yes | Yes | No |
| Manage agents | Yes | No | No |
| Site settings | Yes | No | No |
| Invite users | Yes | No | No |
| View content | Yes | Yes | Yes |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/auth.ts` — add `role` field to User interface
- `packages/cms-admin/src/lib/invitations.ts` — new file for invitation CRUD
- `packages/cms-admin/src/app/api/admin/invitations/route.ts` — new API routes
- `packages/cms-admin/src/app/admin/settings/team/page.tsx` — new team management UI
- `packages/cms-admin/src/app/invite/[token]/page.tsx` — new public accept page
- `packages/cms-admin/src/middleware.ts` — add role-based route guards

### Blast radius
- Auth system (`auth.ts`) is used by every protected route — role changes must be backwards-compatible
- JWT claims (`SessionPayload`) affect all API authorization checks
- Existing single-user setups must auto-migrate to `role: 'admin'`

### Breaking changes
- `User` interface gains required `role` field — existing `users.json` needs migration
- `SessionPayload` gains `role` claim — existing JWTs will lack it until re-login

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Existing user auto-migrated to admin role
- [ ] Invitation create/accept/revoke flow works
- [ ] Role-based route guards block editor from settings
- [ ] Public invite accept page renders without auth

## Implementation Steps

1. Add `role` field to `User` interface in `packages/cms-admin/src/lib/auth.ts`, default existing users to `admin`
2. Create `packages/cms-admin/src/lib/invitations.ts` with `createInvitation()`, `listInvitations()`, `revokeInvitation()`, `validateToken()`, `acceptInvitation()`
3. Create API routes at `packages/cms-admin/src/app/api/admin/invitations/`
4. Create team management page at `packages/cms-admin/src/app/admin/settings/team/page.tsx` with invite form and member list
5. Create public accept page at `packages/cms-admin/src/app/invite/[token]/page.tsx` with name + password form
6. Add `SessionPayload.role` to JWT claims in `auth.ts`
7. Update `middleware.ts` to check role on protected routes (settings, agents, trash purge)
8. Add email notification option using transactional email (optional, works without — invite link shown in UI)

## Dependencies

- None (builds on existing auth in `packages/cms-admin/src/lib/auth.ts`)
- F29 (Transactional Email) is optional for sending invite emails

## Effort Estimate

**Medium** — 3-4 days
