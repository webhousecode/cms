# F160 — OIDC trusted publishing for npm (+ pin npm@11.5.1)

## Motivation

npm is phasing out **2FA-bypass automation tokens** (the classic `NPM_TOKEN` this repo's `publish.yml` uses):

- **~early August 2026:** bypass tokens can no longer change trusted-publishing config / package access / org grants (must be done interactively with 2FA).
- **~January 2027:** bypass tokens lose **direct publish** entirely (staging + human 2FA approval only).

Our `publish.yml` authenticates with a classic `NODE_AUTH_TOKEN: secrets.NPM_TOKEN` + `--provenance`. That is the **exposed** path — it stops working for direct publish by Jan 2027. npm's recommended replacement is **OIDC trusted publishing** (token-free): GitHub Actions exchanges its OIDC id-token with npm directly, no long-lived secret.

Second, urgent CI hazard flagged by `components` (2026-07-10): **npm 12.0.0** (published as `latest` ~2026-07-08) **breaks `npm publish --provenance`** with `Cannot find module 'sigstore'`, and turns install-time scripts OFF by default. Fix: **pin `npm@11.5.1`**. Our CI didn't hit it yet (bundled npm 11.x), but a drift to npm 12 would break every publish — pin defensively.

Context: `@broberg/cms-chat-client@0.4.14` was first-published via a **manual bootstrap** (Christian `npm login` as `cbroberg` + local `npm publish` with OTP) because the CI `NPM_TOKEN` is **granular / update-only** — it can publish new versions of existing packages but cannot CREATE a new name (clean `404 on PUT`). Trusted publishing removes that whole token-scope problem.

## Prerequisite (Christian, interactive, 2FA — before early August)

Trusted Publisher cannot be pre-configured for a package that has never been published (chicken-and-egg, confirmed in npm docs). `@broberg/cms-chat-client` now **exists**, so this is unblocked:

> npmjs.com → the package → **Settings → Trusted publishing → Add GitHub Actions**
> - Organization or user: `webhousecode`
> - Repository: `cms`
> - Workflow filename: `publish.yml`
> - Environment name: *(blank)*
> - Allowed actions: `npm publish`

(Christian began this setup 2026-07-10 — all four fields verified correct against a screenshot; only "Allowed actions = npm publish" + Save remained.)

## Approach (pattern from `components`, adapted)

Add a **tag-triggered OIDC publish job** (start with `cms-chat-client`, then extend to the other packages before the Jan-2027 deadline). No naked cutover — the existing classic-token `publish.yml` keeps working until OIDC is proven live for at least one package.

```yaml
on: { push: { tags: ['cms-chat-client-v*'] } }

publish-cms-chat-client:
  if: startsWith(github.ref, 'refs/tags/cms-chat-client-v')
  runs-on: ubuntu-latest
  permissions: { contents: read, id-token: write }   # id-token = OIDC
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, registry-url: https://registry.npmjs.org }
    - run: npm install -g npm@11.5.1        # NOT @latest (npm 12 breaks --provenance)
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @broberg/cms-chat-client build   # + typecheck + test
    - <guard 1: tag == package.json version>
    - <guard 2: version not already on npm>
    - run: npm publish --access public --provenance
      working-directory: packages/cms-chat-client
    # NB: NO NODE_AUTH_TOKEN / NPM_TOKEN env — npm >=11.5.1 does the OIDC exchange itself.
```

### The two guard steps (verbatim from components #16933 — insert BEFORE `npm publish`)

```yaml
- name: Guard — tag matches package.json version
  if: startsWith(github.ref, 'refs/tags/cms-chat-client-v')
  working-directory: packages/cms-chat-client
  run: |
    PKG=$(node -p "require('./package.json').version")
    TAG="${GITHUB_REF_NAME#cms-chat-client-v}"
    if [ "$PKG" != "$TAG" ]; then
      echo "::error::tag cms-chat-client-v$TAG does not match version $PKG"
      exit 1
    fi

- name: Guard — version not already on npm
  working-directory: packages/cms-chat-client
  run: |
    PKG=$(node -p "require('./package.json').version")
    if npm view "@broberg/cms-chat-client@$PKG" version >/dev/null 2>&1; then
      echo "::error::@broberg/cms-chat-client@$PKG already published — bump the version first."
      exit 1
    fi
    echo "Publishing @broberg/cms-chat-client@$PKG"
```

Guard 1 = release fails if git tag ≠ package.json version (catches a forgotten bump). Guard 2 = fails if the version is already on npm (idempotent, no double-publish). Both run before `npm publish`, so either failure blocks the release.

## Rollout

1. Christian sets up Trusted Publisher for `@broberg/cms-chat-client` (above).
2. Add the OIDC job + guards to `publish.yml`; pin `npm@11.5.1`.
3. Bump `cms-chat-client` version → `git tag cms-chat-client-v<ver> && git push origin <tag>` → confirm token-free OIDC publish (registry-verified, provenance written, no OTP, no NPM_TOKEN).
4. Once proven, extend the tag-triggered OIDC pattern to the remaining packages (per-package TP setup) and retire the classic-token path before Jan 2027.

## Non-goals

- Not re-architecting the whole fleet-version-bump publish flow in one shot — prove OIDC on one package first.
- Not removing the classic-token `publish.yml` until OIDC is proven live (no naked cutover).

## Stories

- **F160.1** — OIDC job + guards + npm pin for `@broberg/cms-chat-client`, verified token-free publish end-to-end.

## References

- components intercom #16896 / #16908 / #16931 / #16933 (OIDC pattern + guards + npm-12 warning + deprecation timeline).
- F158.2 (`@broberg/cms-chat-client`) — the package this migration first targets.