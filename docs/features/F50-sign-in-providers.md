# F50 — Sign In Providers

> Multiple OAuth authentication providers — GitHub (done), Google, Discord, Apple, Azure AD — with account linking and provider management in admin settings.

## Problem

The CMS currently supports only email/password login and GitHub OAuth (F26). This limits adoption:

- Teams using Google Workspace can't SSO into the CMS
- Gaming/community sites want Discord auth
- Enterprise customers need Azure AD / Entra ID
- Apple Sign In is required for iOS apps (F07 COCpit)
- No way to link multiple providers to one account — if a user signs in with GitHub today and Google tomorrow, they get two separate accounts

## Relationship to Existing Features

| Feature | Overlap | How F50 differs |
|---------|---------|-----------------|
| **F26 GitHub Login** | GitHub OAuth already implemented | F50 generalizes the pattern to multiple providers, reuses F26's OAuth flow as a reference |
| **F19 Enterprise** | Mentions SSO | F50 implements the auth provider layer; F19 adds RBAC, audit logs, and tenant-level SSO policies on top |
| **F01 Invite Users** | User creation | F50 auto-creates users on first OAuth sign-in; F01 handles email invitations and role assignment |

## Solution

A provider registry pattern (similar to AI provider registry in `cms-ai`) where each OAuth provider is a configured adapter. The login page shows enabled providers as buttons. Account linking merges providers into a single user record via email matching. Configuration lives in Site Settings → Auth tab.

## Technical Design

### 1. Provider Registry

```typescript
// packages/cms-admin/src/lib/auth-providers.ts

export interface AuthProvider {
  id: string;                    // "github" | "google" | "discord" | "apple" | "azure"
  name: string;                  // Display name
  icon: string;                  // Icon component name or SVG
  authorizeUrl: string;          // OAuth authorize endpoint
  tokenUrl: string;              // OAuth token endpoint
  userInfoUrl: string;           // User info endpoint
  scopes: string[];              // Required scopes
  clientId: string;              // From site config
  clientSecret: string;          // From site config (encrypted)
}

export interface AuthProviderConfig {
  provider: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;          // Stored encrypted in _data/auth-providers.json
  tenantId?: string;             // Azure AD only
}

const BUILTIN_PROVIDERS: Record<string, Omit<AuthProvider, "clientId" | "clientSecret">> = {
  github: {
    id: "github",
    name: "GitHub",
    icon: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["user:email"],
  },
  google: {
    id: "google",
    name: "Google",
    icon: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
  },
  discord: {
    id: "discord",
    name: "Discord",
    icon: "discord",
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
  },
  apple: {
    id: "apple",
    name: "Apple",
    icon: "apple",
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    userInfoUrl: "", // Apple returns user info in the ID token
    scopes: ["name", "email"],
  },
  azure: {
    id: "azure",
    name: "Microsoft",
    icon: "microsoft",
    authorizeUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    scopes: ["openid", "email", "profile"],
  },
};
```

### 2. User Model Extension

```typescript
// Extend existing User interface in packages/cms-admin/src/lib/auth.ts

export interface UserProvider {
  provider: string;              // "github", "google", etc.
  providerId: string;            // Provider's user ID
  email: string;                 // Email from provider
  linkedAt: string;              // ISO timestamp
}

export interface User {
  id: string;
  email: string;
  passwordHash?: string;         // Optional — users can sign up with OAuth only
  name: string;
  createdAt: string;
  zoom?: number;
  providers?: UserProvider[];     // Linked OAuth providers
  avatarUrl?: string;            // From OAuth provider
}
```

### 3. OAuth Flow API Routes

```
GET  /api/auth/providers                    → list enabled providers
GET  /api/auth/oauth/[provider]             → redirect to provider's authorize URL
GET  /api/auth/oauth/[provider]/callback    → handle callback, create/link user, set session
POST /api/auth/link/[provider]              → link additional provider to current user
DELETE /api/auth/link/[provider]            → unlink provider from current user
```

### 4. Account Linking Logic

On OAuth callback:
1. Get email from provider's user info
2. Check if a user with that email exists
3. **If exists:** Link provider to existing user, set session
4. **If not exists:** Create new user with OAuth data (no password), set session
5. **If user is already logged in:** Link as additional provider

### 5. Login Page Update

```
┌──────────────────────────────────┐
│         webhouse.app             │
│                                  │
│  [🔒 Sign in with GitHub    ]   │
│  [🔒 Sign in with Google    ]   │
│  [🔒 Sign in with Discord   ]   │
│  [🔒 Sign in with Microsoft ]   │
│  [🔒 Sign in with Apple     ]   │
│                                  │
│  ──────── or ────────            │
│                                  │
│  Email: [________________]       │
│  Password: [_____________]       │
│  [ Sign in ]                     │
└──────────────────────────────────┘
```

Only enabled providers show buttons. Email/password always available if user has a password set.

### 6. Settings UI — Auth Tab

New tab in Site Settings:

```
Site Settings → Auth

AUTHENTICATION PROVIDERS

┌─────────────────────────────────────┐
│ ✅ GitHub          [Configure]      │
│ ○  Google          [Enable]         │
│ ○  Discord         [Enable]         │
│ ○  Apple           [Enable]         │
│ ○  Microsoft/Azure [Enable]         │
└─────────────────────────────────────┘

Click Configure → modal:
  Client ID: [________________]
  Client Secret: [●●●●●●●●●●●]
  Callback URL: https://your-cms.com/api/auth/oauth/google/callback
  [Save] [Disable]
```

### 7. Storage

```
_data/auth-providers.json     # Provider configs (encrypted secrets)
_data/users.json              # Extended with providers[] array
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/auth-providers.ts` — new provider registry
- `packages/cms-admin/src/lib/auth.ts` — extend User with `providers[]`, optional `passwordHash`
- `packages/cms-admin/src/app/api/auth/oauth/[provider]/route.ts` — new generic OAuth routes
- `packages/cms-admin/src/app/api/auth/oauth/[provider]/callback/route.ts` — new callback handler
- `packages/cms-admin/src/app/admin/login/page.tsx` — add provider buttons
- Site Settings — new Auth tab

### Blast radius
- User model change affects all auth-dependent code
- Login page redesign affects first user experience
- Existing GitHub OAuth needs refactoring to generic pattern

### Breaking changes
- `User.passwordHash` becomes optional — existing code must handle undefined
- `User.providers` added — optional array

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Google OAuth flow completes successfully
- [ ] Account linking merges providers by email
- [ ] Login page shows enabled providers dynamically
- [ ] Existing email/password login still works

## Implementation Steps

1. **Create `auth-providers.ts`** — provider registry with builtin providers
2. **Extend User interface** — add `providers[]`, `avatarUrl`, make `passwordHash` optional
3. **Create `/api/auth/providers` endpoint** — list enabled providers
4. **Create `/api/auth/oauth/[provider]/route.ts`** — generic OAuth redirect
5. **Create `/api/auth/oauth/[provider]/callback/route.ts`** — generic callback handler with account linking
6. **Refactor existing GitHub OAuth** — migrate from custom flow to generic provider
7. **Update login page** — show provider buttons dynamically
8. **Add Auth tab to Site Settings** — enable/disable providers, client ID/secret
9. **Add account linking UI** — in user profile settings, show linked providers
10. **Add provider-specific icons** — GitHub, Google, Discord, Apple, Microsoft SVGs
11. **Apple Sign In** — requires JWT client secret generation (Apple-specific)
12. **Azure AD** — requires tenant ID configuration
13. **Test** — OAuth flow for each provider, account linking, unlinking

## Dependencies

- **F26 GitHub Login** — existing GitHub OAuth flow to generalize (Done)
- **F01 Invite Users** — role assignment on first OAuth sign-in

## Effort Estimate

**Medium** — 4-5 days

- Day 1: Provider registry, User model extension, generic OAuth routes
- Day 2: Refactor GitHub OAuth to generic flow, Google provider
- Day 3: Discord, Apple, Azure AD providers
- Day 4: Login page, Settings UI, account linking
- Day 5: Testing, edge cases (email conflicts, unlinking last provider)
