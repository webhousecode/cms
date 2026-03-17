# F57 — Extranet (Protected Site Pages)

> Site-facing authentication that protects specific pages on a published website, allowing only logged-in Extranet users to view them. Completely separate from CMS admin access.

## Problem

Today, every page on a CMS-powered site is public. There is no way to create member-only content, client portals, gated resources, or internal company pages. The CMS has user management (F01), but that's for admin access — website visitors have no identity at all.

Common use cases that are currently impossible:
- **Client portal** — a design agency shares project updates with clients behind login
- **Member-only content** — a SaaS company publishes premium guides only for subscribers
- **Internal pages** — a company intranet with team resources, policies, handbooks
- **Gated resources** — download whitepapers after registering with email
- **Course content** — progressive access to lessons based on enrollment

## Solution

A separate "Extranet" authentication system for website visitors, managed from CMS admin but running entirely on the site side:

1. **Extranet Users** — managed per-site in CMS admin under Settings → Extranet. These are NOT CMS users — they cannot access admin. They have email + password and optional metadata (name, company, tags).
2. **Page Protection** — any document can be marked as `protected: true` (or assigned to protection groups). Protected pages require Extranet login to view.
3. **Site-side Auth** — a lightweight auth middleware/component that sites integrate. Login page, session management, and route protection all run on the published site, not in CMS admin.
4. **Invite or Self-Register** — admins can invite Extranet users by email, or enable self-registration (optionally with approval).

## Technical Design

### Data Model

```typescript
// packages/cms/src/schema/types.ts — new builtin field options
// Documents can have a `protected` boolean field or `accessGroups` array field

// packages/cms-admin/src/lib/extranet.ts
export interface ExtranetUser {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  company?: string;
  tags: string[];              // e.g. ["client", "premium", "team-a"]
  accessGroups: string[];      // which groups they belong to
  status: "active" | "pending" | "disabled";
  createdAt: string;
  lastLoginAt?: string;
  invitedBy?: string;          // CMS user ID
}

export interface AccessGroup {
  id: string;
  name: string;               // e.g. "Clients", "Premium Members", "Team Alpha"
  description?: string;
}

export interface ExtranetConfig {
  enabled: boolean;
  selfRegistration: boolean;   // allow visitors to register themselves
  requireApproval: boolean;    // admin must approve self-registrations
  loginPagePath: string;       // e.g. "/login" — the site's login page URL
  afterLoginPath: string;      // e.g. "/portal" — redirect after login
  sessionDurationDays: number; // default 30
  accessGroups: AccessGroup[];
}
```

Stored per-site in `_data/extranet-users.json` and `_data/extranet-config.json`.

### Protection Model

Documents get two optional builtin fields (added to any collection):

```typescript
// In cms.config.ts — collection definition
{
  name: "resources",
  fields: [
    { name: "title", type: "text" },
    { name: "body", type: "richtext" },
    // Protection fields:
    { name: "protected", type: "boolean", defaultValue: false },
    { name: "accessGroups", type: "tags" }, // which groups can see this
  ]
}
```

- `protected: true` + empty `accessGroups` → any logged-in Extranet user can see it
- `protected: true` + `accessGroups: ["clients"]` → only users in "clients" group
- `protected: false` → public (default)

### CMS Admin UI

**Settings → Extranet tab:**
- Enable/disable Extranet for this site
- Self-registration toggle + require approval toggle
- Login page path + redirect path configuration
- Access Groups management (CRUD list)

**Settings → Extranet → Users tab:**
- List of Extranet users (email, name, groups, status, last login)
- Invite form (email + access groups)
- Bulk actions: activate, disable, delete
- User detail panel: edit groups, reset password, view login history

**Document editor:**
- "Protected" toggle in document sidebar (when Extranet is enabled)
- Access Groups multi-select (which groups can see this document)
- Visual lock icon on protected documents in collection list

### Site-Side Integration

A lightweight integration package that sites import. NOT a full auth library — just the minimal glue between CMS Extranet data and the site's Next.js middleware.

```typescript
// packages/cms/src/extranet/middleware.ts — shipped with @webhouse/cms
import { NextRequest, NextResponse } from "next/server";

export interface ExtranetMiddlewareConfig {
  loginPath: string;           // e.g. "/login"
  protectedPaths: string[];    // e.g. ["/portal", "/resources"]
  cookieName?: string;         // default: "extranet-session"
  apiBase?: string;            // CMS admin URL for token verification
}

export function createExtranetMiddleware(config: ExtranetMiddlewareConfig) {
  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check if path is protected
    const isProtected = config.protectedPaths.some(p => pathname.startsWith(p));
    if (!isProtected) return NextResponse.next();

    // Check session
    const token = request.cookies.get(config.cookieName ?? "extranet-session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL(config.loginPath, request.url));
    }

    // Verify token (JWT, self-contained — no API call needed)
    // Token contains: { sub, email, groups, exp }
    // ...
    return NextResponse.next();
  };
}
```

```typescript
// packages/cms/src/extranet/components.tsx — React components for sites
export function ExtranetLoginForm({
  apiBase,
  onSuccess,
  className
}: ExtranetLoginFormProps) {
  // Renders email + password form
  // POSTs to /api/extranet/login on the site
  // Sets session cookie on success
}

export function ExtranetGuard({
  groups,
  fallback,
  children
}: ExtranetGuardProps) {
  // Client component that checks session
  // Shows children if authorized, fallback if not
}

export function useExtranetUser(): ExtranetUser | null {
  // Hook to get current Extranet user from session
}
```

### API Endpoints

**CMS Admin API** (for managing Extranet users from admin):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/extranet/users` | Site Admin | List Extranet users |
| `POST` | `/api/admin/extranet/users` | Site Admin | Create/invite Extranet user |
| `PATCH` | `/api/admin/extranet/users/[id]` | Site Admin | Update user (groups, status) |
| `DELETE` | `/api/admin/extranet/users/[id]` | Site Admin | Delete user |
| `GET` | `/api/admin/extranet/config` | Site Admin | Get Extranet config |
| `PUT` | `/api/admin/extranet/config` | Site Admin | Update config |

**Site-Side API** (routes the site adds to handle Extranet auth):

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/extranet/login` | Public | Authenticate Extranet user |
| `POST` | `/api/extranet/logout` | Session | Clear session |
| `POST` | `/api/extranet/register` | Public | Self-registration (if enabled) |
| `GET` | `/api/extranet/me` | Session | Current user info |

The site-side routes are provided as helpers in `@webhouse/cms/extranet` — the site imports and re-exports them in its `app/api/extranet/` directory.

### Authentication Flow

```
1. Visitor hits /portal/secret-page
2. Next.js middleware (extranet) checks session cookie
3. No cookie → redirect to /login
4. /login page renders ExtranetLoginForm
5. Form POSTs to /api/extranet/login
6. API verifies credentials against _data/extranet-users.json
7. Issues JWT session cookie (extranet-session)
8. Redirect to /portal/secret-page
9. Middleware verifies JWT, checks accessGroups
10. Page renders with protected content
```

JWT is self-contained (no API callback to CMS admin needed):
```json
{
  "sub": "extranet-user-uuid",
  "email": "client@example.com",
  "name": "Jane Client",
  "groups": ["clients", "premium"],
  "siteId": "webhouse-site",
  "exp": 1711234567
}
```

Signed with a per-site secret stored in `_data/extranet-config.json`.

### Content Delivery

When a site renders a page, it checks the document's `protected` and `accessGroups` fields:

```typescript
// In the site's page component
import { getDocument } from "@webhouse/cms";
import { getExtranetSession } from "@webhouse/cms/extranet";

export default async function ResourcePage({ params }) {
  const doc = await getDocument("resources", params.slug);

  if (doc.protected) {
    const session = await getExtranetSession();
    if (!session) redirect("/login");

    // Check group access
    if (doc.accessGroups?.length > 0) {
      const hasAccess = doc.accessGroups.some(g => session.groups.includes(g));
      if (!hasAccess) return <AccessDenied />;
    }
  }

  return <ResourceContent doc={doc} />;
}
```

### Password Management

- **Admin-created users:** Admin invites by email → invite link → user sets password (reuses F01 invite pattern, but for Extranet)
- **Self-registered users:** Registration form → sets own password → optionally needs admin approval
- **Password reset:** Admin can generate reset link from Extranet Users panel. Self-service reset via email requires F29 Transactional Email.
- **Hashing:** bcrypt (same as CMS users)

## Implementation Steps

1. Create `packages/cms-admin/src/lib/extranet.ts` — ExtranetUser CRUD, ExtranetConfig read/write
2. Create Extranet config API routes (`/api/admin/extranet/config`)
3. Create Extranet users API routes (`/api/admin/extranet/users/...`)
4. Add "Extranet" tab to Site Settings page
5. Build Extranet Users management UI (list, invite, edit groups, disable/enable)
6. Build Access Groups management UI in Settings → Extranet
7. Add "Protected" toggle + Access Groups selector to document editor sidebar
8. Add lock icon indicator to collection list for protected documents
9. Create `packages/cms/src/extranet/` — middleware helper, login form component, guard component, session utils
10. Create `packages/cms/src/extranet/api-handlers.ts` — exportable route handlers for `/api/extranet/login`, `/logout`, `/register`, `/me`
11. Add Extranet section to CLAUDE.md (AI builder guide) with integration instructions
12. Add Extranet example to Next.js boilerplate (F42) — protected `/portal` section
13. Password reset flow (manual link from admin; self-service deferred to F29)

## Dependencies

- **F01 Invite Users** — reuses invite pattern, must exist for admin user management
- **F29 Transactional Email** — optional, for self-service password reset and invite emails
- **F42 Framework Boilerplates** — optional, for including Extranet example in starter template

## Effort Estimate

**Large** — 8-10 days

- Phase 1 (Admin management): 3 days — config, user CRUD, groups, Settings UI
- Phase 2 (Site integration): 3 days — middleware, components, API handlers, JWT
- Phase 3 (Document protection): 2 days — editor UI, collection list indicators, content filtering
- Phase 4 (Polish): 1-2 days — self-registration, approval flow, boilerplate example
