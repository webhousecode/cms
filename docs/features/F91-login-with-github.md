# F91 — Login with GitHub

> Use your existing GitHub account to sign up and log in to the CMS admin — no separate password needed.

## Problem

CMS login currently requires email + password. But:

1. The GitHub OAuth flow is **already built** (F26) — users connect GitHub for repo access, the token is in a cookie
2. Every developer already has a GitHub account
3. Managing a separate CMS password is friction, especially during onboarding
4. The GitHub token is needed for GitHub-backed sites anyway — login should be the same flow

## Solution

Add a "Sign in with GitHub" button on the login page. Reuse the existing GitHub OAuth infrastructure (F26). On callback: fetch the user's GitHub email/name via GitHub API, find or create a CMS user, issue a `cms-session` JWT, and redirect to admin. First GitHub login auto-creates an account (JIT provisioning). Subsequent logins match by email.

This is deliberately split from F50 (Sign In Providers) which covers Google/Discord/Apple/Azure AD + account linking. GitHub login ships now because the infrastructure already exists.

## Technical Design

### 1. Login Page — Add GitHub Button

```tsx
// packages/cms-admin/src/app/admin/(auth)/login/page.tsx

// Add above or below the email/password form:
<a
  href="/api/auth/github?login=true"
  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md
    border border-border hover:bg-secondary transition-colors text-sm"
>
  <GithubIcon className="w-4 h-4" />
  Sign in with GitHub
</a>
```

The `?login=true` query param tells the callback to create a CMS session (not just store the GitHub token).

### 2. GitHub OAuth Route — Add `login` Flow

Extend existing `/api/auth/github/route.ts`:

```typescript
// Add login=true to the OAuth state so callback knows the intent
const isLogin = request.nextUrl.searchParams.get("login") === "true";
const state = crypto.randomUUID();
const statePayload = JSON.stringify({ state, login: isLogin });

// Request user:email scope (need email for user matching)
const scopes = isLogin ? "user:email,read:user" : "repo,user:email,read:user";
```

### 3. GitHub Callback — Auto-Create/Login User

Extend existing `/api/auth/github/callback/route.ts`:

```typescript
// After getting access token, check if this is a login flow
const stateData = JSON.parse(storedState ?? "{}");
const isLogin = stateData.login === true;

if (isLogin) {
  // 1. Fetch GitHub user profile
  const ghUser = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  }).then(r => r.json());

  // 2. Fetch primary email (may be private)
  const emails = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  }).then(r => r.json());
  const primaryEmail = emails.find((e: any) => e.primary)?.email ?? ghUser.email;

  if (!primaryEmail) {
    return NextResponse.redirect(new URL("/admin/login?error=no_github_email", request.url));
  }

  // 3. Find or create CMS user
  const users = await getUsers();
  let user = users.find(u => u.email.toLowerCase() === primaryEmail.toLowerCase());

  if (!user) {
    // JIT provisioning — auto-create on first GitHub login
    user = await createUser(primaryEmail, null /* no password */, ghUser.name ?? primaryEmail.split("@")[0], {
      role: users.length === 0 ? "admin" : "editor",  // first user is admin
      source: "github",
    });
  }

  // 4. Issue CMS session JWT
  const token = await createToken(user);
  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set("cms-session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  // 5. Also store GitHub token (for repo access)
  response.cookies.set("github-token", tokenData.access_token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

// ... existing non-login flow continues
```

### 4. User Model — Support Passwordless Users

The `User` interface already has `passwordHash` as a required field. For GitHub-only users, we need to make it optional:

```typescript
// packages/cms-admin/src/lib/auth.ts
export interface User {
  // ...existing fields
  passwordHash?: string;     // optional — users can sign up via GitHub only
  source?: "local" | "github" | "invite";
  githubUsername?: string;
}
```

Login with email/password must check `if (!user.passwordHash)` and show "This account uses GitHub login" error instead of silently failing.

### 5. Account Linking — Existing Users

If a user already has an email/password account and logs in with GitHub using the same email:
- Match by email → use existing account
- Store `githubUsername` on the user
- Both login methods work going forward

### 6. Gravatar → GitHub Avatar

The admin header already shows Gravatar. For GitHub-linked users, use their GitHub avatar instead:

```typescript
// In /api/auth/me — prefer GitHub avatar if available
const avatarUrl = user.githubUsername
  ? `https://github.com/${user.githubUsername}.png?size=64`
  : `https://www.gravatar.com/avatar/${md5(user.email)}?d=mp&s=64`;
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/app/admin/(auth)/login/page.tsx` — add GitHub button
- `packages/cms-admin/src/app/api/auth/github/route.ts` — add `login` param + email scope
- `packages/cms-admin/src/app/api/auth/github/callback/route.ts` — add user creation + session flow
- `packages/cms-admin/src/lib/auth.ts` — make `passwordHash` optional, add `source`, `githubUsername`
- `packages/cms-admin/src/app/api/auth/me/route.ts` — prefer GitHub avatar

### Downstream dependents

`auth.ts` is imported by 12+ files:
- `app/api/admin/profile/route.ts` — unaffected (already handles optional password via `newPassword` check)
- `app/api/auth/github/callback/route.ts` — modified (this feature)
- `app/api/admin/team/route.ts` — unaffected (uses `createUser` which gains optional password)
- `app/api/admin/invitations/route.ts` — unaffected
- `middleware.ts` (proxy.ts) — unaffected (only reads JWT, doesn't check passwordHash)
- `lib/team-access.ts` — unaffected

`login/page.tsx` — leaf component, no downstream dependents.
`github/route.ts` and `callback/route.ts` — leaf API routes, no downstream dependents.

### Blast radius
- Making `passwordHash` optional means `verifyPassword()` must handle `undefined` gracefully — return null (login fails with "use GitHub" message)
- First user auto-created as admin via GitHub — same as current email/password setup flow
- GitHub OAuth scopes expand from `repo,user:email,read:user` to include login context — existing "Connect GitHub" flow unaffected (uses separate state flag)

### Breaking changes
- `User.passwordHash` becomes optional — backwards-compatible (existing users all have it)
- `createUser()` accepts `null` password — new parameter, doesn't affect existing callers

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] "Sign in with GitHub" button visible on login page
- [ ] First-time GitHub login creates CMS user with admin role
- [ ] Subsequent GitHub login finds existing user by email
- [ ] Email/password login still works for existing users
- [ ] User with GitHub-only account gets error when trying password login
- [ ] GitHub avatar shows in admin header for linked users
- [ ] "Connect GitHub" flow (non-login) still works for repo access
- [ ] Invite flow still works (creates user with password)

## Implementation Steps

1. Make `passwordHash` optional in `User` interface, add `source` and `githubUsername` fields
2. Update `createUser()` to accept `null` password
3. Update `verifyPassword()` to handle missing passwordHash (return null + helpful error)
4. Extend `/api/auth/github/route.ts` — add `login` param to state, ensure `user:email` scope
5. Extend `/api/auth/github/callback/route.ts` — add login flow (fetch profile, find/create user, issue JWT)
6. Add "Sign in with GitHub" button to login page
7. Update `/api/auth/me` to prefer GitHub avatar
8. Test all flows: new user, existing user, password-only user, invite flow

## Dependencies

- F26 (GitHub Login) — Done. Existing OAuth infrastructure to extend.

## Effort Estimate

**Small** — 1 day

The OAuth flow, token exchange, and cookie management already exist. This adds ~50 lines to the callback route, ~5 lines to auth.ts, and a button to the login page.
