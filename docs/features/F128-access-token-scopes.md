# F128 — Access Token Scope Selector UI

> **Status:** Planned  
> **Extracted from:** F07 (Mobile App) Session 2  
> **Last updated:** 2026-04-09

## Summary

The Access Token backend already supports scoped tokens (`admin`, `content:read`, `content:write`, `deploy`, `media`), but the UI in Account Preferences → Access Tokens always creates tokens with `admin` scope. This feature adds a scope selector to the token creation UI and displays scopes clearly in the token list.

## What Already Exists

### Backend (fully implemented)

| File | What |
|------|------|
| `packages/cms-admin/src/lib/access-tokens.ts` | Token store with `TokenScope` type: `"admin" \| "content:read" \| "content:write" \| "deploy" \| "media"` |
| `packages/cms-admin/src/lib/access-tokens.ts:104` | `hasScope(token, scope)` — `admin` grants all scopes |
| `packages/cms-admin/src/app/api/admin/access-tokens/route.ts` | POST accepts `scopes[]` in body, validates against `VALID_SCOPES` |
| `packages/cms-admin/src/proxy.ts` | `wh_*` Bearer auth mints JWT with scopes from token entry |

### UI (needs work)

| File | What |
|------|------|
| `packages/cms-admin/src/components/settings/access-tokens-panel.tsx` | Current panel — hardcodes `scopes: ["admin"]` on line 36 |
| `packages/cms-admin/src/app/admin/(workspace)/account/page.tsx` | Account page, tab `tokens` renders `<AccessTokensPanel />` |

## Scope Model

| Scope | Grants |
|-------|--------|
| `admin` | Everything — equivalent to a logged-in admin session |
| `content:read` | Read documents, collections, media metadata |
| `content:write` | Create/update/delete documents |
| `deploy` | Trigger deploys |
| `media` | Upload/delete media files |

`admin` is a superset — if selected, all others are implied and should be visually indicated.

## Implementation Plan

### Phase 1: Scope Selector in Create Form

In `access-tokens-panel.tsx`:

1. Add a multi-select checkbox group below the token name input
2. Default selection: `admin` (current behavior, backwards compatible)
3. When `admin` is checked, other checkboxes are visually checked + disabled (implied)
4. When `admin` is unchecked, user picks individual scopes (at least one required)
5. Send selected scopes in the POST body (already supported by API)

**UI pattern:** Use the standard CMS admin checkbox style — NOT `CustomSelect` (this is multi-toggle, not a dropdown). Small inline checkboxes with scope label + one-line description.

```
┌─────────────────────────────────────────────────┐
│ Token name: [CI Deploy Bot          ] [Generate]│
│                                                 │
│ Scopes:                                         │
│ ☑ Admin (full access)                           │
│ ☑ Content: Read    (implied by Admin)           │
│ ☑ Content: Write   (implied by Admin)           │
│ ☑ Deploy           (implied by Admin)           │
│ ☑ Media            (implied by Admin)           │
└─────────────────────────────────────────────────┘
```

### Phase 2: Scope Display in Token List

The token list grid already shows a "Scopes" column (`t.scopes?.join(", ")`). Improve it:

1. If scopes include `admin` → show pill badge "Admin" (primary color)
2. Otherwise → show individual scope pills (muted style)
3. Use the same small pill/badge pattern used elsewhere in CMS admin

### Phase 3: Scope Enforcement Audit

Verify that `proxy.ts` and any other middleware actually check scopes on write endpoints:

- `POST /api/admin/deploy` → requires `deploy` or `admin`
- `POST /api/cms/documents` → requires `content:write` or `admin`
- `GET /api/cms/documents` → requires `content:read` or `admin`
- `POST /api/media/upload` → requires `media` or `admin`

Use `hasScope(token, requiredScope)` from `access-tokens.ts`.

## Key Decisions

- **No breaking change** — existing tokens with `["admin"]` keep working
- **`admin` is default** — new tokens default to admin for simplicity
- **Minimum one scope** — API already enforces this (returns 400)
- **No scope editing after creation** — revoke and recreate (matches GitHub/GitLab pattern)

## Test Plan

1. Create token with `admin` → verify all endpoints work
2. Create token with only `deploy` → verify deploy works, content write returns 403
3. Create token with `content:read` → verify read works, write returns 403
4. Verify `admin` checkbox disables/implies other checkboxes in UI
5. Verify existing tokens still display correctly after UI update
