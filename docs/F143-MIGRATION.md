# F143 Migration Guide — trail-landing pilot + future sites

This guide documents the F143 (Common Build Server) pilot migration of
`trail-landing` and the steps to migrate other filesystem-adapter sites
to the new build-server flow.

## What F143 changes

Before F143, a filesystem-adapter site needed:
- `build.ts` + `package.json` + `node_modules` on the cms-admin host
- The host (Christian's Mac OR webhouse.app's Fly machine) had to have
  Node + tsx + every site's deps locally
- Beam transported only content — source files lived on the original
  Mac, breaking "rocket from webhouse.app" for any beamed site

After F143:
- cms-admin provides core deps (`marked`, `gray-matter`, `slugify`,
  `sharp`, `marked-highlight`) for all sites — no per-site install
- Beam transports `build.ts` + `package.json` + `public/` + (no
  node_modules) to webhouse.app via the new `source/` archive section
- cms-admin auto-scans build.ts for npm imports, installs anything
  not already provided into a content-addressable deps-store
  (`{dataDir}/build-deps/<hash>/`), shared across sites with identical
  dep-sets
- Pinned versions: auto-detected deps get `pnpm view <pkg> version`
  resolved at install time; the resolved version goes into the store
  hash → no silent upgrades, no "build worked yesterday" bugs

## trail-landing pilot — dry-run findings

Ran the F143 dep-scanner against `/Users/cb/Apps/broberg/trail/apps/landing/build.ts`:

```
Raw imports found:    4
  - node:fs       (filtered: builtin)
  - node:path     (filtered: builtin)
  - marked        (provided by cms-admin core pulje)
  - zod           (NEEDS INSTALL → auto-handled by F143 P4)

MISSING (need install): 1
  - zod
```

Conclusion: trail-landing's build.ts has exactly **one** non-core npm
dep (`zod`). When the F143 pipeline runs end-to-end, the install-queue
will:
1. Resolve `zod@latest` → e.g. `zod@3.25.76`
2. Hash → e.g. `7a3f9e1b…`
3. `pnpm install zod@3.25.76` into `{dataDir}/build-deps/7a3f9e1b/`
4. Splice that path into the build-time NODE_PATH
5. trail-landing's build.ts can now `import { z } from "zod"` and it
   resolves through the deps-store

Total cold-cost: ~3 sec (single small dep, pnpm content-store hit).
Subsequent rebuilds: 0 sec (idempotency check skips re-install).

## Migration steps (don't run blindly — read each first)

### Step 1: Verify F143 P1-P5 are deployed to webhouse.app

```bash
# Check that webhouse.app is on the F143 commits
flyctl status -a webhouse-app
# Image tag should be from a commit >= 2d321359 (F143 P5 + test.yml fix)

# Confirm the deps-store dir is writable on the Fly volume
flyctl ssh console -a webhouse-app -C "ls -la /data/cms-admin/"
# Should show write access for nextjs:nogroup. build-deps/ doesn't
# need to exist yet — installer creates it on first install.
```

### Step 2: Re-beam trail-landing FROM localhost TO webhouse.app

This is the **safe** version that doesn't delete anything yet:

```bash
# On localhost cms-admin: trigger Beam Export for trail-landing
# (UI: Site Settings → Beam → Export → download .beam file)
# OR via API:
curl -X POST http://localhost:3010/api/admin/beam/export \
  -H "Cookie: $(get-session-cookie)" \
  -d '{"siteId":"trail"}' > trail-landing.beam

# Verify the new archive INCLUDES the source/ section (F143 P2):
unzip -l trail-landing.beam | grep "^.*source/"
# Should list: source/build.ts, source/package.json, source/public/...
# If empty: cms-admin is on a pre-F143-P2 build, deploy that first
```

### Step 3: Import trail-landing on webhouse.app

```
# On webhouse.app/admin: Site Settings → Beam → Import → upload .beam
# Auto-applies the new source/ files to /data/cms-admin/beam-sites/trail/
# Verify on Fly:
flyctl ssh console -a webhouse-app -C "ls /data/cms-admin/beam-sites/trail/"
# Should now show: build.ts, package.json, public/, content/, cms.config.ts
# (And NO node_modules/ — that's the point)
```

### Step 4: Click rocket on webhouse.app/admin for trail-landing

Expected behavior:
1. Deploy-modal opens with builder progress
2. Log: `[deploy] Installing 1 extra dep(s) into deps-store 7a3f9e1b…`
3. Log: `[deploy] Installed extra deps in ~3000ms`
4. Log: `[deploy] Running native build.ts in /data/cms-admin/beam-sites/trail/ (out=deploy/) — runtime=cms-admin`
5. Log: build.ts output (page count, etc.)
6. Log: `[deploy] Pushed N files to gh-pages branch`
7. Modal shows "Live"

If something fails:
- "pnpm install failed" → check Fly volume disk space + network egress
- "Cannot find module 'zod'" → NODE_PATH wiring broke; check
  prepareExtraDeps() runs (search Fly logs for "extra dep(s)")
- "No build.ts found" → re-beam didn't include source/; verify Step 2

### Step 5 (only after Step 4 succeeds): clean up local trail-landing

DO NOT DO THIS UNTIL Step 4 has been verified end-to-end with Christian
in browser:

```bash
# Locally — frees ~50 MB
cd /Users/cb/Apps/broberg/trail/apps/landing
rm -rf node_modules package-lock.json
# (Keep build.ts + package.json + public/ — they ship via Beam now)
```

After cleanup, future content edits via webhouse.app/admin auto-deploy
to gh-pages without any local action. Christian's Mac becomes pure
authoring + git surface; build infrastructure lives in cms-admin.

## Migration steps for other filesystem sites

The same flow applies to any filesystem-adapter site. Audit candidates
(per registry inspection 2026-05-02):

- `webhouse-site` (filesystem, revalidateUrl set → ICD primary path)
- `cms-docs` (filesystem) — could be migrated; build.ts uses likely
  marked+gray-matter (both provided)
- `bridgeberg` (filesystem)
- `maurseth` (filesystem) — build.ts has 0 npm deps per audit, will
  Just Work
- `examples/static/*` (filesystem) — boilerplates, low-priority

Process per site:
1. Run dep-scanner against its build.ts (one-liner script in this doc)
2. Confirm MISSING list is reasonable (any heavy deps need consideration)
3. Re-beam → import on webhouse.app
4. Test rocket from webhouse.app
5. Clean up local node_modules

## Rollback plan if F143 breaks a site

Each F143 commit is independently revertable:

```bash
# Revert just P3 (extra-deps system) but keep P1+P2 (core deps + Beam):
git revert 2a52f551

# OR revert the auto-install hook in run-site-build.ts but keep
# the deps-store infrastructure:
# Edit run-site-build.ts and remove the prepareExtraDeps() call

# Sites with no extra deps (e.g. maurseth) work either way —
# prepareExtraDeps() returns null when no deps are needed.
```

The deps-store at `{dataDir}/build-deps/` can be safely deleted at any
time; cms-admin will re-install on next rocket-trigger.

## What's NOT in this F143 pilot (deferred)

These were planned in the F143 spec but require interactive UI verification
(per CLAUDE.md hard rule "UI changes must be verified in browser"):

- Site Settings → Build → Dependencies tab UI (`[Check for updates]`
  buttons, semver-color-coded patch/minor/major, change-log links)
- Smoke-build sandbox before promoting an upgrade
- 7-day rollback button for previous deps-store hashes
- Weekly `pnpm audit` cron + CVE surface in cms-admin home dashboard

These belong in a follow-up session where I (or Christian) can interactively
test the UI in a browser and confirm it works. The PIN-FIRST primitive
that backs them is shipped (P5) — the policy works correctly without UI;
the UI is a quality-of-life addition, not a correctness requirement.

## Status snapshot (2026-05-03 03:35)

| Phase | Status | Commit |
|---|---|---|
| P1: Foundation (5 core deps + provided-deps API) | ✅ shipped | d3f226ca |
| P2: Beam source-list extension | ✅ shipped | c2f70547 |
| P3: Extra-deps content-addressable store + install queue | ✅ shipped | 2a52f551 |
| P4: Auto-detect via es-module-lexer + wire into runSiteBuild | ✅ shipped | 06a43c74 |
| P5: PIN-FIRST version resolution | ✅ shipped (UI deferred) | a51594d4 |
| P6: trail-landing pilot | 🟡 dry-run done; production migration pending Christian's verification | this commit |

Total tests added: 89 (across P1-P5). Typecheck clean. No regressions in
existing 22 beam tests + 55 build tests.
