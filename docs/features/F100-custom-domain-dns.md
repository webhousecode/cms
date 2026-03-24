# F100 — Custom Domain DNS Validation

> Real-time DNS validation and auto-provisioning for custom domains in Deploy Settings — checks webhouse.app zone availability, auto-creates CNAME records, verifies external domain DNS.

## Problem

When a user enters a custom domain in Deploy Settings, there's zero validation. They type `boutique.webhouse.app`, save, deploy — and only discover it conflicts with an existing record after the deploy fails or serves the wrong site. For external domains, there's no way to verify the CNAME is pointed correctly before deploying.

The webhouse.app DNS zone is managed via the dns-manager API, and existing CMS-deployed sites already use it (boutique.webhouse.app, bridgeberg.webhouse.app). We should validate and auto-provision in this zone.

## Solution

Add a DNS validation API endpoint that checks domain availability and CNAME correctness. For `*.webhouse.app` subdomains: query the dns-manager API to check if the subdomain is taken, and auto-create the CNAME record on save. For external domains: resolve DNS to verify the CNAME points to the correct deploy target. UI shows real-time availability feedback (green checkmark / red X) as the user types.

## Technical Design

### Two domain types

| Type | Example | Validation | On save |
|------|---------|------------|---------|
| webhouse.app subdomain | `my-site.webhouse.app` | Check dns-manager zone for conflicts | Auto-create CNAME → deploy target |
| External domain | `blog.example.com` | Resolve DNS, verify CNAME points to `*.github.io` or `*.fly.dev` | Show DNS instructions |

### API Endpoint

```typescript
// packages/cms-admin/src/app/api/admin/dns/check-domain/route.ts

// GET /api/admin/dns/check-domain?domain=my-site.webhouse.app&provider=flyio&appName=my-site
// Returns:
interface DnsCheckResult {
  available: boolean;       // true if domain can be used
  isWebhouseApp: boolean;   // true if *.webhouse.app
  currentRecord?: string;   // existing CNAME target if taken
  ownedBySite?: boolean;    // true if the existing record points to this site's deploy target
  dnsConfigured?: boolean;  // for external domains: is CNAME pointing correctly?
  expectedTarget?: string;  // what the CNAME should point to
  message?: string;         // human-readable status
}
```

### DNS API Integration

The CMS admin server calls the WebHouse DNS REST API directly (not via MCP). The dns-manager exposes a standard HTTP API:

1. **Check availability**: `GET {DNS_API_URL}/zones/webhouse.app/records?type=CNAME&name={subdomain}`
2. **Create record**: `POST {DNS_API_URL}/zones/webhouse.app/records` with type=CNAME, name=subdomain, alias=target
3. **Update record**: `PUT {DNS_API_URL}/zones/webhouse.app/records/{id}` when switching deploy provider
4. **Delete record**: `DELETE {DNS_API_URL}/zones/webhouse.app/records/{id}` when removing custom domain

`DNS_API_URL` and `DNS_API_KEY` are configured in org settings (F87) or env vars.

For external domains, use Node.js `dns.resolveCname()` to verify DNS configuration.

### Auto-provisioning flow (webhouse.app subdomains)

```
User types "my-site" in domain field
  → UI appends ".webhouse.app" automatically
  → Debounced API call: GET /api/admin/dns/check-domain?domain=my-site.webhouse.app
  → API queries dns-manager: is "my-site" CNAME taken?
  → Returns { available: true } → green checkmark
  → User saves settings
  → Save handler calls: POST /api/admin/dns/provision-domain
    → Creates CNAME: my-site.webhouse.app → thinking-in-pixels.fly.dev.
    → (GitHub Pages: my-site.webhouse.app → cbroberg.github.io.)
  → Deploy uses the custom domain
```

### Deploy Service Integration

Update `flyioBuildAndDeploy()` and `githubPagesBuildAndDeploy()` to call DNS provisioning before deploy when domain is `*.webhouse.app`.

### UI Changes

The Custom Domain input in `deploy-settings-panel.tsx` gets:
- Debounced validation (300ms) showing availability status
- Green checkmark: "Available" / "Already configured for this site"
- Red X: "Taken by another site" / "DNS not configured"
- Yellow warning: "DNS propagation pending"
- "webhouse.app" suffix hint when no TLD is typed
- Auto-append `.webhouse.app` if user types just a subdomain

```tsx
// Inline status next to input
<span style={{ fontSize: "0.65rem", color: dnsStatus === "available" ? "rgb(74 222 128)" : "var(--destructive)" }}>
  {dnsStatus === "available" && "✓ Available"}
  {dnsStatus === "taken" && "✕ Taken"}
  {dnsStatus === "configured" && "✓ Configured for this site"}
  {dnsStatus === "misconfigured" && "⚠ CNAME not pointing to deploy target"}
</span>
```

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/app/api/admin/dns/check-domain/route.ts` — availability check endpoint
- `packages/cms-admin/src/app/api/admin/dns/provision-domain/route.ts` — auto-create/update CNAME
- `packages/cms-admin/src/lib/dns-manager.ts` — dns-manager API client

**Modified files:**
- `packages/cms-admin/src/components/settings/deploy-settings-panel.tsx` — add validation UI to custom domain input
- `packages/cms-admin/src/lib/deploy-service.ts` — call DNS provisioning before deploy for webhouse.app domains

### Downstream dependents

`deploy-settings-panel.tsx` — imported by `settings/page.tsx` only. No downstream impact.

`deploy-service.ts` — called from `api/admin/deploy/route.ts` only. No downstream impact.

### Blast radius
- DNS changes affect live sites — must never overwrite existing records that belong to other sites
- Availability check is read-only (safe)
- CNAME creation only for confirmed-available subdomains
- External domain check is DNS resolution only (no writes)
- No changes to existing config interfaces or storage format

### Breaking changes
None — purely additive. Existing custom domain field works as before, validation is enhancement only.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit --project packages/cms-admin/tsconfig.json`
- [ ] `GET /api/admin/dns/check-domain?domain=available-name.webhouse.app` returns `{ available: true }`
- [ ] `GET /api/admin/dns/check-domain?domain=boutique.webhouse.app` returns `{ available: false, currentRecord: "cbroberg.github.io." }`
- [ ] Provisioning creates CNAME in webhouse.app zone
- [ ] External domain check: verify CNAME resolution works
- [ ] Existing deploys with custom domains still work
- [ ] Removing custom domain from settings cleans up CNAME record

## Implementation Steps

1. Create `dns-manager.ts` client library (HTTP wrapper for dns-manager API)
2. Create `/api/admin/dns/check-domain` route — query dns-manager for webhouse.app, DNS resolution for external
3. Create `/api/admin/dns/provision-domain` route — auto-create/update/delete CNAME records
4. Update `deploy-settings-panel.tsx` — debounced validation with status icons on custom domain input
5. Update `deploy-service.ts` — call provisioning before deploy for webhouse.app domains
6. Test with existing sites (boutique, bridgeberg) to verify no conflicts

## Dependencies
- F12 One-Click Deploy (In progress) — custom domain field exists
- dns-manager API access (already available)

## Effort Estimate
**Small** — 1-2 days
