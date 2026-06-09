# F153 — Per-tenant capabilities (feature toggles per customer)

> **Status: PLAN FOR REVIEW.** Christian captured this idea and asked for "en god plan i første omgang" to discuss when he's back. Nothing is built yet — this doc is the discussion starter. Decisions still open are collected in **§9**.

## 1. Motivation

The CMS has grown rich — AI everywhere (generate, proofread, SEO, chat, agents, image analysis, translate), Maps, Interactives, Forms, Backup, Link-checker, Lighthouse/Performance, Curation, Scheduling, etc. For a **simple new customer this is overwhelming**: dozens of nav items and buttons they will never use, and "AI everywhere" is not always wanted.

Today the only axis we can turn down is **role** (`admin` / `editor` / `viewer` in `permissions-shared.ts`) — but that gates *which person* can do *which action*. It does **not** let us say "*this whole customer's CMS has no AI*" or "*this tenant is a stripped-down content+media editor*". Christian wants exactly that: a **lighter CMS per customer**, with whole feature areas toggleable **per tenant** — without deleting any code.

## 2. The key idea — capabilities are a SECOND axis, orthogonal to roles

| Axis | Question it answers | Scope | Lives in |
|---|---|---|---|
| **Permission** (exists today) | "Can *this user* do X?" | per **user/role** | `permissions-shared.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`, `hasPermission`/`requirePermission`/`can`) |
| **Capability** (this feature) | "Does *this tenant* have feature X at all?" | per **site/org (tenant)** | NEW — `capabilities` in site-config (+ org defaults) |

They **compose**: a feature is shown/runnable only when `tenantHasCapability(cap) && userHasPermission(perm)`. Capability is the outer gate (is the feature even part of this customer's CMS), permission is the inner gate (may this person use it). This keeps the existing role system untouched and adds the "simplified CMS" lever on top.

## 3. Scope (what we build)

1. A **capability config** per tenant — a set of boolean feature flags stored in site-config, with org-level defaults that a site can override (same inheritance pattern as `locales`).
2. A **capability catalog** (`CAPABILITIES`) — the single source of truth listing every toggleable capability: key, human label, description, and what it gates (nav items, routes, tools). Mirrors how `PERMISSIONS` is defined.
3. **Profiles / presets** — one-click bundles so onboarding isn't 20 switches: e.g. **Minimal** (content + media only), **Standard** (content, media, SEO, forms), **Full** (everything, = today). A profile just sets the booleans; everything stays individually tweakable after.
4. **Gating on every layer** the feature touches (same defense-in-depth table the permission rule already mandates), but keyed on capability:
   | Layer | Gate |
   |---|---|
   | Sidebar nav (`sidebar.tsx`) | `{caps.ai && <AI nav/>}` |
   | Server page/layout | `if (!hasCapability(cfg,"ai")) redirect("/admin")` |
   | API route | `const denied = await requireCapability("ai"); if (denied) return denied;` (404/403) |
   | Chat tool (`lib/chat/tools.ts`) | add `capability: "ai"` to the tool def; filtered out when off |
   | MCP tool (`cms-mcp-server`) | gate by capability before exposing |
   | Command palette / quick actions | `if (!canUse("ai")) return null` |
   | Buttons inside pages (e.g. ✨ AI buttons in the editor) | `{canUse("ai") && <AIButton/>}` |
5. **Admin UI** — Site Settings → **Features** (or "Capabilities"): grouped switches + the profile picker. Admin-only (gated by a new `capabilities.manage` permission). Each switch = one capability; a banner shows which profile is active / "customized".
6. **Helpers** (parallel to the permission helpers):
   - server: `hasCapability(siteConfig, key)`, `requireCapability(key)` (returns a 404/redirect response when off),
   - client: `useCapabilities()` (from `useHeaderData().siteConfig`) + `canUse(key)`.

## 4. Architecture sketch

- **Storage.** Add `capabilities?: Record<CapabilityKey, boolean>` to the site-config shape (read via `readSiteConfig()` / `useHeaderData().siteConfig` — already the shared context, so no new fetch per the "shared context" hard rule). Optional org-level `capabilities` provides defaults; resolution = `{ ...PROFILE_DEFAULTS.full, ...orgCaps, ...siteCaps }` so an unset key defaults **on** (backward compatible).
- **Catalog** in a new `lib/capabilities-shared.ts` (client+server safe, like `permissions-shared.ts`):
  ```ts
  export const CAPABILITIES = {
    ai:           { label: "AI features",     gates: ["ai.*", "/admin/agents", "/admin/curation", editorAIButtons] },
    seo:          { label: "SEO & visibility", gates: ["/admin/seo", "/admin/visibility"] },
    maps:         { label: "Maps",            gates: [mapFieldType, "/admin/.../map"] },
    interactives: { label: "Interactives",    gates: ["/admin/interactives"] },
    agents:       { label: "AI agents",       gates: ["/admin/agents"], requires: "ai" },
    chat:         { label: "Chat",            gates: [chatMode], requires: "ai" },
    forms:        { label: "Forms",           gates: ["/admin/forms"] },
    media:        { label: "Media library",   gates: ["/admin/media"] },     // core — usually always on
    backup:       { label: "Backup & restore", gates: ["/admin/backup"] },
    quality:      { label: "Link-check / Lighthouse / Performance", gates: ["/admin/link-checker","/admin/lighthouse","/admin/performance"] },
    scheduling:   { label: "Scheduled publishing", gates: ["/admin/scheduled"] },
    // …content + media are effectively the "core" that Minimal keeps.
  } as const;
  ```
  Capabilities can declare `requires` (e.g. `agents`/`chat` imply `ai`) so turning AI off cascades.
- **Profiles** `CAPABILITY_PROFILES = { minimal, standard, full }` map each profile → the boolean set.
- **Compose with permissions** at every gate: `can(perm) && canUse(cap)`.

## 5. Coarse-first granularity

Start with **~10 coarse capability groups** (AI, SEO, Maps, Interactives, Agents, Chat, Forms, Backup, Quality-tools, Scheduling) rather than per-feature switches — that already delivers "a customer without AI" and "a stripped editor". Finer sub-toggles (e.g. proofread vs generate within AI) can be added later under the same catalog without reworking the gates. **AI is the headline lever** (it's the most pervasive and the one Christian named).

## 6. Backward compatibility (must-not-break)

- Every existing tenant resolves to the **Full** profile (all caps on) because unset keys default on → **zero behavior change** for current customers on day one.
- No feature code is removed or moved — gates are additive wrappers only. A capability flip never deletes content or config.

## 7. Rollout phases

- **F153.1 — Foundation (already a story):** `capabilities-shared.ts` catalog + profiles, site-config field + org-default resolution, `hasCapability`/`requireCapability`/`canUse` helpers, Site Settings → Features UI (switches + profile picker, `capabilities.manage` permission, data-testid on every control). Default all-on. No gates wired yet (so nothing changes) — ship + verify the config round-trips.
- **F153.2 — Wire the headline gates:** AI (nav + editor AI buttons + `ai.*` API routes + chat + agents), then SEO, Maps, Interactives. Each gate = capability ∧ permission. Verify a "Minimal"-profile tenant in the browser (via Lens) shows the stripped CMS.
- **F153.3 — Remaining groups + org inheritance + onboarding profile pick** (new tenant/onboarding chooses Minimal/Standard/Full).
- **F153.4 (later/optional):** map capabilities to a future pricing tier (a plan sets a profile) — explicitly out of scope now, noted so we don't design ourselves into a corner.

## 8. Non-goals

- **Not** removing or hiding feature *code* — purely runtime toggles.
- **Not** a replacement for roles/permissions — capabilities compose with them.
- **Not** a billing/pricing/entitlements system (though §7 F153.4 leaves a clean seam for one).
- **Not** per-*user* feature toggles — capability is per-tenant; per-user stays the role system.

## 9. Open questions — to discuss with Christian

1. **Granularity:** coarse groups first (recommended, §5) vs finer per-feature switches from the start?
2. **Org vs site:** should capabilities be set at **org** level (one switch for all the org's sites) with per-site override, or **site-only**? (Recommend org-default + site-override, like locales.)
3. **Who can toggle:** only WebHouse super-admins (us, packaging a customer's CMS) vs the customer's own admin too? (Recommend: gated by `capabilities.manage`, granted to admins; we can withhold from a "Minimal" tenant's admin so they can't re-enable AI themselves.)
4. **Default for *new* tenants:** which profile does onboarding pick by default — Minimal or Standard?
5. **Future pricing link:** do we want capabilities to eventually be driven by a subscription tier (F153.4), or stay a pure ops/packaging tool?
6. **"Core" line:** confirm Content + Media (+ Pages/Posts editing) are the always-on core that even Minimal keeps.

---

*Plan authored by cc on idea capture; awaiting Christian's review + the §9 decisions before any code. Per the cardmem plan-doc rule, this doc exists before any F153 implementation.*
