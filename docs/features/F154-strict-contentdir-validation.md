# F154 — Strict-mode validation for filesystem.contentDir misconfiguration

## Motivation
2026-06-27 incident (broberg-ai): the site's cms-admin showed every collection empty after a webhouse.app deploy. Root cause was a malformed `storage` block in its `cms.config.ts`:

```ts
storage: { adapter: 'filesystem', contentDir: './content' }   // WRONG: flat + relative
```

`createCms` reads `config.storage.filesystem?.contentDir` (`packages/cms/src/index.ts:100`). The flat `storage.contentDir` is invisible to it, so the adapter was constructed with the DEFAULT relative `'content'`, which resolves against `process.cwd()` = the deployed app bundle (ephemeral). Every deploy wiped the live content store. `createCms({ strict: true })` did NOT catch it: the strict check only rejected a *relative* `filesystem.contentDir`, not a *missing* or *misplaced* one. See memory `broberg-ai-content-wipe-bug`.

## Scope
Harden `createCms({ strict: true })` (`packages/cms/src/index.ts`) so a filesystem adapter without a usable absolute `filesystem.contentDir` throws loudly at construction instead of silently defaulting to an ephemeral relative path. Cover three failure modes:
1. **Misplaced flat `storage.contentDir`** (the broberg-ai bug) — throw, telling the dev to nest it under `filesystem`.
2. **Missing `filesystem.contentDir`** (filesystem adapter, no/empty contentDir) — throw.
3. **Relative `filesystem.contentDir`** — throw (existing behaviour, kept).

### Non-goals
- Do NOT change non-strict behaviour (single-site `npx cms build` keeps resolving relative paths against cwd).
- Do NOT auto-migrate/auto-fix a malformed config (fail loud > silently rewrite).
- No change to github/sqlite/supabase adapters.

## Architecture
Replace the single relative-path check inside the `options?.strict` block with a filesystem-specific guard that reads `flat = (storage as any).contentDir` and `nested = storage.filesystem?.contentDir`, then throws if: `flat` is set but `nested` is not (misplacement); `nested` is missing/empty (required); or `nested` is relative (existing). Each error names the exact problem, the ephemeral-app-bundle consequence, and the fix.

## Tests
`packages/cms/src/__tests__/` — strict-mode rejects (a) flat `storage.contentDir`, (b) filesystem adapter with no contentDir, (c) relative nested contentDir; and accepts an absolute nested contentDir. Non-strict mode unaffected.

## Rollout
Engine change → bump cms package → active wherever cms-admin loads a site with `strict:true` (`site-pool.ts` / `cms.ts`). Audited 2026-06-27: only broberg-ai was malformed (now fixed), so no existing site will newly fail. Deploy webhouse-app to pick up the new engine.
