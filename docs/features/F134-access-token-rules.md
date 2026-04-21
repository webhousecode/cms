# F134 — Access Token Rules (Cloudflare-style permission model)

> **Status:** Proposed
> **Extends:** F128 (Access Token Scope Selector UI) — supersedes its flat scope model
> **Requested by:** trail-site session (Christian Broberg)
> **Last updated:** 2026-04-20

## Summary

Replace the flat `scopes: TokenScope[]` array on `StoredToken` with a
Cloudflare-style `rules: TokenRule[]` array. Each rule explicitly names
`(effect, resources, permissions)` — giving precise, per-site and
per-admin-area access control instead of today's "admin grants
everything" coarse buckets.

A token can authorise, for example:

- "Deploy to site `trail` only, nothing else" (CI bot for a single site)
- "Read content across all sites, write to none" (audit/backup tool)
- "Edit content in sites `trail`, `fysiodk`; deploy to `trail` only" (agency
  collaborator with narrow mandate)
- "Everything everywhere except `org:settings`" (admin token without
  power to re-issue itself)

Today's flat scopes can't express any of these. F128 adds a UI to pick
scopes, but the model itself can't narrow by site or deny specific areas.

## Motivation

### Why flat scopes aren't enough

- **No site scoping.** A token with `deploy` scope can deploy *any* site
  in the org. Critical for multi-site CMS installations where different
  sites have different SLAs, different customers, different trust levels.
- **No explicit deny.** The admin-grants-everything shortcut is
  convenient but prevents "almost admin, but not THIS" patterns that
  mature APIs need.
- **No per-admin-area scoping.** `admin` means everything including
  managing tokens, team members, org settings. A CI bot shouldn't be
  able to re-issue itself with broader scope.
- **No room to grow.** Every new admin surface (forms, media CDN,
  webhooks) would need a new scope constant and a breaking `TokenScope`
  union change.

### Why Cloudflare's model

Cloudflare API tokens have been in production for years and are the
reference implementation for fine-grained API auth. The mental model —
"a token is a list of rules, each rule says allow or deny for certain
resources and permissions" — is familiar to anyone who's used AWS IAM
or Kubernetes RBAC, and generalises cleanly to any admin surface we add
later.

## Data model

> **Revised 2026-04-20 to mirror Cloudflare's actual model literally.**
> Previous draft had allow/deny per rule; Cloudflare is simpler: all
> permissions are implicit-allow, and scoping is done via separate
> Include/Exclude resource filters and IP filters. Screenshot from
> `dash.cloudflare.com` used as the reference.

### Schema

```ts
/** A single permission line. Cloudflare calls this a "permission group"
 * and renders it as three cascading dropdowns (scope → category →
 * action). We flatten to `"<scope>:<action>"` strings because the CMS
 * permission space is smaller. */
export type Permission =
  // content
  | "content:read" | "content:write" | "content:publish"
  // media
  | "media:read" | "media:write" | "media:delete"
  // deploy
  | "deploy:trigger" | "deploy:read"
  // forms
  | "forms:read" | "forms:write"
  // admin surfaces (org-level, no per-site narrowing)
  | "team:manage" | "tokens:manage" | "sites:read" | "sites:write"
  | "org:settings:read" | "org:settings:write";

/** Where the permissions apply. Cloudflare's `Account` → `Include /
 * Exclude` → `All accounts | Specific accounts` maps to:
 *   scope:   "org" | "site" | "admin-area"
 *   effect:  "include" | "exclude"
 *   targets: "*" | string[] (site ids or admin area names)
 */
export type ResourceScope = "org" | "site" | "admin-area";
export type ResourceEffect = "include" | "exclude";

export interface ResourceFilter {
  scope: ResourceScope;
  effect: ResourceEffect;
  /** "*" means all under the scope; otherwise an array of specific ids
   * (site slugs, admin-area names like "deploy" / "tokens" / "team"). */
  targets: "*" | string[];
}

/** Cloudflare-literal IP filter. Operator maps to their "Is in" /
 * "Is not in" pill. Values are CIDRs or single IPs. */
export type IpFilterOp = "in" | "not_in";
export interface IpFilter {
  op: IpFilterOp;
  cidrs: string[]; // "192.168.1.88" or "10.0.0.0/8"
}

export interface StoredToken {
  id: string;
  name: string;
  hash: string;                      // SHA-256 of raw `wh_<hex>`
  userId: string;
  createdAt: string;
  lastUsed?: string;

  /** First 10 chars of the raw token (`wh_<7 hex>`). Stored at creation
   * so the UI can render enough entropy for a local grep without
   * leaking the secret. 53 hex nybbles of entropy remain, preserving
   * SHA-256 preimage resistance. `null` for tokens minted before F134
   * (we cannot recover the raw value from the hash). */
  displayPrefix: string | null;

  /** What the token can do. All entries are implicit-allow. */
  permissions: Permission[];

  /** Where it can do those things. Multiple filters combine: all
   * `include` filters are OR'd to form the allow-set; then all
   * `exclude` filters subtract from that set. Empty array = "all
   * resources in the org" (Cloudflare's default "All accounts"). */
  resources: ResourceFilter[];

  /** Optional IP allow/deny rules. Empty array = no IP restriction.
   * Multiple filters combine: `in`-filters define the allowlist;
   * `not_in`-filters are denylist. If the caller's IP matches any
   * `not_in`, reject; else if any `in`-filter is present, caller's IP
   * must match one. */
  ipFilters: IpFilter[];

  /** Cloudflare-style TTL window. Both fields optional. `notBefore`
   * reserves the token for future use; `notAfter` expires it. */
  notBefore?: string;
  notAfter?: string;
}
```

### Evaluation algorithm

Given a request with `(permission P, resource R, client IP I)` against
a token:

1. **TTL window check.** Reject if `now < notBefore` or `now >= notAfter`.
2. **IP filter check.**
   - Any `not_in` filter whose CIDRs contain `I` → reject.
   - If any `in`-filter exists, at least one must contain `I` → else
     reject.
   - No filters → allow past this step.
3. **Permission check.** `P` must be in `permissions[]`. Else reject.
4. **Resource check.** Compute the effective resource set:
   - Start with everything covered by `include`-filters (or the whole
     org if no `include` filter is present — Cloudflare default).
   - Subtract everything covered by `exclude`-filters.
   - `R` must be in the resulting set.

All four checks must pass. Order is fixed so faster-to-evaluate steps
bail early (TTL and IP are O(1); permission is O(permissions); resource
is O(filters)).

### Resource matching examples

| Request resource | Token resource filters | Result |
|---|---|---|
| `site:trail` | `[]` (empty) | allow (default = all) |
| `site:trail` | `[{include, site, ["trail"]}]` | allow |
| `site:trail` | `[{include, site, ["fysiodk"]}]` | deny |
| `site:trail` | `[{include, site, "*"}, {exclude, site, ["fysiodk"]}]` | allow |
| `site:fysiodk` | same as above | deny |
| `admin:deploy` | `[{include, "admin-area", ["deploy"]}]` | allow |
| `org:settings` | `[{include, site, "*"}]` | deny (scope mismatch; `site`-scope doesn't include org-level) |

## Permission catalogue

Grouped by admin area for readability. The enum above is the
authoritative list.

### Content
| Permission | Grants |
|---|---|
| `content:read` | Read documents, collections, revisions |
| `content:write` | Create / update / delete drafts |
| `content:publish` | Flip status to `published` (distinct from write so an editor can write but a different role publishes) |

### Media
| Permission | Grants |
|---|---|
| `media:read` | List uploads, read metadata |
| `media:write` | Upload new media |
| `media:delete` | Remove uploads |

### Deploy
| Permission | Grants |
|---|---|
| `deploy:trigger` | `POST /api/admin/deploy` — fire a deploy |
| `deploy:read` | `GET /api/admin/deploy` — list recent deploys, read logs |

### Forms
| Permission | Grants |
|---|---|
| `forms:read` | Read submissions |
| `forms:write` | Mark read / delete / export |

### Admin surfaces (org-level, no per-site scoping)

| Permission | Grants |
|---|---|
| `team:manage` | Invite / remove users, change roles |
| `tokens:manage` | Issue / revoke access tokens (dangerous: a token with this can re-issue itself with broader rights — see "Privilege escalation" below) |
| `sites:read` | List sites registered in the org |
| `sites:write` | Create / configure / delete sites |
| `org:settings:read` | Read `_data/org-settings/<orgId>.json` |
| `org:settings:write` | Write org-level settings |

### Meta
| Permission | Grants |
|---|---|
| `*` | All permissions. Used with `effect: "deny"` for "full admin except X" patterns, or with `effect: "allow"` + `resources: ["org:*"]` to express full-admin. |

## API surface

### HTTP

`POST /api/admin/access-tokens` body — Cloudflare-literal shape:

```json
{
  "name": "Fysiodk deploy bot",
  "permissions": ["deploy:trigger", "deploy:read"],
  "resources": [
    { "scope": "site", "effect": "include", "targets": ["fysiodk"] }
  ],
  "ipFilters": [
    { "op": "in", "cidrs": ["203.0.113.4/32"] }
  ],
  "notBefore": null,
  "notAfter": "2027-01-01T00:00:00Z"
}
```

Legacy shape (accepted for one release cycle):

```json
{ "name": "Old bot", "scopes": ["admin"] }
// → treated as:
//   permissions: [all Permissions]
//   resources:   [] (empty = default "all")
//   ipFilters:   []
```

### Middleware

Replace `hasScope()` with `evaluateToken()` and `requireToken()`:

```ts
// lib/access-tokens.ts
export function evaluateToken(
  token: StoredToken,
  permission: Permission,
  resource: Resource,     // runtime resource string e.g. "site:trail"
  clientIp: string,       // caller's IP, already parsed from X-Forwarded-For / NextRequest.ip
  now: Date,
): { allow: boolean; reason?: string };

// lib/auth/require-token.ts
export async function requireToken(
  req: NextRequest,
  permission: Permission,
  resource: Resource,
): Promise<StoredToken | NextResponse>; // NextResponse on failure
```

### Usage at call sites

```ts
// Before (F128):
const denied = await requirePermission("tokens.manage");
if (denied) return denied;

// After (F134):
const siteId = req.nextUrl.searchParams.get("site") ?? "*";
const auth = await requireToken(req, "deploy:trigger", `site:${siteId}`);
if (auth instanceof NextResponse) return auth; // 401/403
// proceed — auth is the StoredToken
```

Session-based auth (NextAuth cookie) still works — the middleware
falls through to the existing session + role check when no Bearer
header is present. Session users get "allow" for whatever their
`_data/team.json` role grants, unchanged.

## UI

### Token create dialog

Mirrors the Cloudflare "Create Custom Token" screen directly — no
invented variations, four sections in a fixed vertical order:

```
┌───────────────────────────────────────────────────────────────┐
│ ← Back to view all tokens                                     │
│                                                               │
│ Create Custom Token                                           │
│                                                               │
│ Token name                                                    │
│   [ Fysiodk Deploy Bot              ]                         │
│                                                               │
│ Permissions                                                   │
│   Select edit or read permissions to apply.                   │
│   [ Site ▾ ]  [ Deploy ▾ ]  [ Trigger ▾ ]                     │
│   [ Site ▾ ]  [ Deploy ▾ ]  [ Read ▾    ]                     │
│   + Add more                                                  │
│                                                               │
│ Resources                                                     │
│   Select resources to include or exclude.                     │
│   [ Include ▾ ]  [ Specific sites ▾ ]  [ fysiodk ✕ ]          │
│   + Add more                                                  │
│                                                               │
│ Client IP Address Filtering (optional)                        │
│   [ Is in ▾ ]  [ 203.0.113.4/32           ]  [ Use my IP ]    │
│   + Add more                                                  │
│                                                               │
│ TTL (optional)                                                │
│   [ Start Date → ]  [ End Date ]                              │
│                                                               │
│ Preview                                                       │
│   This token can:                                             │
│   ✓ Trigger deploy on site fysiodk                            │
│   ✓ Read deploy status on site fysiodk                        │
│   … from IP 203.0.113.4/32 only, until 2027-01-01             │
│                                                               │
│                        [ Cancel ]  [ Continue to summary ]    │
└───────────────────────────────────────────────────────────────┘
```

Cascading dropdown behaviour in the **Permissions** row — three dropdowns
that narrow from left to right, Cloudflare-style:

1. **Scope** — `Account` / `Site` / `Admin Area`. (Maps to whether the
   permission is org-level, per-site, or for a specific admin surface
   like deploy/tokens/team.)
2. **Category** — populates based on scope. For `Site`: Content,
   Media, Deploy, Forms. For `Account`: Sites, Team, Tokens, Org Settings.
3. **Action** — populates based on category. For `Deploy`: Trigger, Read.
   For `Content`: Read, Write, Publish. Etc.

Each row compiles to one `Permission` in the stored token. A token with
"Site → Deploy → Trigger" and "Site → Deploy → Read" stores
`permissions: ["deploy:trigger", "deploy:read"]`.

**Resources** section uses the existing `CustomSelect` component (same
one called out in F128 as the preferred pattern for the scopes UI):
first dropdown Include/Exclude, second Specific Sites / All Sites /
Specific Admin Area / etc., third a multi-chip site / area picker that
reads from `_admin/registry.json`.

**Client IP Address Filtering** section: operator dropdown (`Is in` /
`Is not in`), CIDR/IP input, "Use my IP" button that populates the
input with the admin user's current IP from `X-Forwarded-For`. Empty
section = no IP filtering.

**TTL** section: native date range picker. Empty = token lives
indefinitely until revoked.

**Preview** renders in real time under the form and translates the
state into human sentences. Essential UX — Cloudflare's own UI has
this because the rule-composition is easy to misread.

### Quick presets

A row of preset buttons above the form that populate the fields in one
click. Implemented as plain client-side state-sets, not stored
separately:

- **Admin (full access)** — every permission, no resource filter, no IP
  filter, no TTL.
- **Site deploy bot** — `deploy:trigger` + `deploy:read`, `Include
  Specific sites` = picker.
- **Read everything** — all `*:read` permissions, no filter.
- **Forms webhook** — `forms:read`, include one site.

### Token list row — grep-friendly prefix

**Requested by trail-site session:** the current list shows tokens as
`wh_***` which can't be grepped for in local shell history or env
files when hunting down where a token is used. The UI should display
**the first 10 characters of the raw token** (`wh_<first 7 hex>`),
not just `wh_***`. That's enough entropy to be unique but insufficient
to reconstruct the secret (SHA-256 preimage resistance over 53 random
hex nybbles).

Implementation: store `displayPrefix: string` on `StoredToken` at
creation time — the first 10 chars of the raw token. Show it in the
token list. Optional second column "Last used at" already exists.

```
NAME         PREFIX        SCOPES              LAST USED
Claude Code  wh_53a260d    deploy, content     09/04/2026
Fysiodk bot  wh_7c9f1a2    deploy (fysiodk)    today
```

### Summary / review page

Cloudflare has a "Continue to summary" intermediate step before
actually minting the token. Copy that — shows the final compiled
permissions + resources + IPs + TTL, user clicks "Create token",
token is minted. This catches accidental full-admin permissions one
more time before the secret is issued.

## Migration

### Startup migrator

On CMS admin boot, scan `~/.webhouse/cms-admin/_data/access-tokens.json`
(per cms-core's recent move, commit `6008a590`). For each token where
`permissions` is absent but legacy `scopes` is present, synthesize the
Cloudflare-shaped fields:

| Legacy scope | Synthesized `permissions` | Synthesized `resources` | `ipFilters` |
|---|---|---|---|
| `admin` | *all* permissions (full catalogue) | `[]` (empty = all resources) | `[]` |
| `content:read` | `["content:read"]` | `[]` | `[]` |
| `content:write` | `["content:read","content:write","content:publish"]` | `[]` | `[]` |
| `deploy` | `["deploy:trigger","deploy:read"]` | `[]` | `[]` |
| `media` | `["media:read","media:write","media:delete"]` | `[]` | `[]` |

Multiple legacy scopes on one token merge into one union of permissions
(since legacy tokens were unrestricted by site — empty `resources[]`).

Migration writes back atomically. Keeps the `scopes` field in the record
for one release for rollback safety; F134.1 drops it.

### `displayPrefix` backfill

Legacy tokens don't have a `displayPrefix` (the first-10-chars
grep-friendly prefix added in F134). We cannot recover the raw token
from its SHA-256 hash, so old tokens migrate with `displayPrefix: null`
and render in the UI as `wh_…` (opaque) with an info tooltip:

> "This token was minted before F134. Revoke and re-issue to see a
> grep-friendly prefix for local search."

Users who care can roll the token; users who don't keep the opaque
display. Zero breakage.

### Existing "Claude Code" token

The token in Christian's setup (trail-site audit, 2026-04-20):

- `id: 5ec70fda81e91a6d`
- `hash: 53a260d06d369040…`
- `scopes: ["admin"]`
- `lastUsed: 2026-04-09T19:06:34Z` (38 seconds after `createdAt` —
  consistent with one self-ping at creation time; no evidence of any
  external consumer having called it since)

**No local consumer found.** A full sweep across `/Users/cb/Apps/**/.env*`,
`/Users/cb/Apps/**/.mcp.json`, trail-site's onboarding + admin,
buddy's `packages/`, whapi's source, and global shell rc files turned
up zero references to any `wh_<hex>` secret. So the token is
effectively dormant. After F134 migration it becomes:

```json
{
  "permissions": ["content:read", "content:write", "content:publish",
                  "media:read", "media:write", "media:delete",
                  "deploy:trigger", "deploy:read",
                  "forms:read", "forms:write",
                  "team:manage", "tokens:manage",
                  "sites:read", "sites:write",
                  "org:settings:read", "org:settings:write"],
  "resources": [],        // empty = all
  "ipFilters": [],        // empty = any IP
  "displayPrefix": null   // opaque; can't be recovered
}
```

Behaviour stays identical — token continues to pass auth against every
`/api/admin/*` endpoint. When the token is eventually re-minted with a
narrower rule-set, it becomes grep-friendly via the new
`displayPrefix` field.

**Acceptance criterion for cms-core:** after migration, sending the
raw token value against `POST /api/admin/deploy?site=trail` with
`Authorization: Bearer wh_<original>` must succeed. That's the
contract that keeps the trail-site session unblocked.

## Security notes

### Privilege escalation via `tokens:manage`

A token with `tokens:manage` can call `POST /api/admin/access-tokens` and
issue itself (or a fresh token) with any rules it wants. Unavoidable in
a self-service API — same pattern as AWS IAM's "iam:CreateUser" power.
Mitigations:

1. UI warning when `tokens:manage` is added to any rule.
2. Audit-log every token creation + revoke to `audit.jsonl` (tracked in
   cms-core's sweep for mislocated files) — especially token mints that
   have broader rules than the parent.
3. Consider a bootstrap-only "root" token issued at CMS install time
   that's the only one allowed to mint `tokens:manage` — future work,
   not in F134's scope.

### Deny precedence & UX

Rules are evaluated in order (deny first). Novice users who write
`allow *` then add a `deny team:manage` expect the combination to mean
"admin minus team management" — which it does. Cloudflare's UI
surfaces this as a warning when it detects "this token is effectively
full-admin"; we should copy that.

### Token preview in token list

Show rules as a compiled "this token CAN do" + "this token CANNOT do"
list rather than raw JSON. Rules are data; the UI should show
consequences.

## Testing

Integration tests (`packages/cms-admin/tests/`):

1. Token with `allow deploy:trigger on site:trail` → POST
   `/api/admin/deploy?site=trail` succeeds, POST
   `/api/admin/deploy?site=fysiodk` returns 403.
2. Token with `allow *` on `org:*` + `deny team:manage` → can hit
   content endpoints, cannot hit team endpoints.
3. Legacy token with `scopes: ["admin"]` behaves identically to a
   post-migration token with one allow-org-everything rule.
4. Expired token returns 401 regardless of rules.
5. Client-IP outside allowlist returns 403 before rule evaluation.
6. Wildcard matching: `resources: ["site:*"]` matches request for
   `site:anything`; `resources: ["site:trail"]` does not match
   `site:fysiodk`.

## Rollout

| Phase | Work | Owner |
|---|---|---|
| Phase 0 | Storage already moved to `~/.webhouse/cms-admin/_data/` (commit `6008a590`) | cms-core (done) |
| Phase 1 | `TokenRule` type + `evaluateToken` + `requireToken` middleware + migration shim | cms-core |
| Phase 2 | `POST /api/admin/access-tokens` accepts `rules[]`; deprecate `scopes[]` with one-release shim | cms-core |
| Phase 3 | Wire `requireToken` into `POST /api/admin/deploy` first, then other `/api/admin/*` routes progressively | cms-core |
| Phase 4 | UI — rule builder in access-tokens-panel.tsx (replaces F128's scope picker) | cms-core |
| Phase 5 | Audit-log integration for token mints | cms-core (likely in parallel with the mislocated-files sweep) |

## Open questions

1. **Should permissions be hierarchical?** e.g. `content:*` as a
   shortcut for all content permissions. Cloudflare does this as
   "permission groups". Probably yes — add `content:*`, `media:*`,
   `deploy:*`, `forms:*`, `org:*` as aliases in the permission
   catalogue. Expands at evaluation time.

2. **Per-collection scoping inside a site?** "Allow content:write on
   site:trail posts collection only". Likely overkill for MVP;
   Cloudflare doesn't go below zone-level for DNS either. Defer.

3. **Role-to-rules mapping for session users?** Session users have
   roles (admin/editor/viewer in `_data/team.json`). To unify the
   evaluator, roles should compile to rules. F134 doesn't require
   this — `requireToken` can stay token-only, and session auth keeps
   its existing role check. Worth noting for architectural cleanliness.

4. **Explicit `clientIpAllowlist` on tokens:** Cloudflare supports it.
   Useful for CI-bot tokens restricted to GitHub Actions IPs. Schema
   has the field; UI + enforcement can land in F134.1.

## Cross-references

- **F128** (Access Token Scope Selector UI) — predecessor, F134 supersedes
  its UI while keeping its backend scope-validation as the migration
  source of truth.
- **cms-core commit `6008a590`** — storage-flyt til `~/.webhouse/cms-admin/_data/access-tokens.json`, which F134 builds on.
- **Mislocated-files sweep** (tracked by cms-core) — audit-log integration
  for token mints should coordinate with that work.
- **trail-site onboarding F134** (separate repo) — unrelated but shares
  feature number; no conflict since repos are independent.
