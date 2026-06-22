---
description: Commit the working tree AND push to origin main — Christian's "cp".
argument-hint: "[optional subject/focus]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git push:*), Bash(git rev-parse:*)
---

Commit the current working tree **and push to origin main** — Christian's `cp`.

1. Run `git status` and `git diff` (staged + unstaged) so you see exactly what changed.
2. Decide ONE clear commit message in this repo's convention — `type(F<n>): subject`
   when the work maps to an F-number (`feat`/`fix`/`docs`/`refactor`/`chore`), otherwise
   `type: subject`. If `$ARGUMENTS` is given, use it as the subject/focus.
3. Stage the real changes (`git add <paths>`). **EXCLUDE:**
   - secrets and gitignored files (`.env`, `.lens-mint-secret`, anything under `.gitignore`),
   - local-only deploy-bypass scaffolding that would break CI: `Dockerfile.prebuilt`,
     the `fly.toml` `[build] dockerfile = "Dockerfile.prebuilt"` line, and the
     `.dockerignore` `!apps/web/dist` negation. Stage only the real hunks of those files.
   Call out anything you deliberately left out.
4. Commit, ending with this trailer:

   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
5. `git push origin main` (this repo works on `main`). Report the pushed commit SHA + a
   one-line summary.
6. Heads-up: pushing to `main` triggers the GitHub Actions CD (depot build). That's fine
   when depot is healthy; if that pipeline is currently red (e.g. depot outage), say so —
   prod is being shipped via the local `flyctl deploy` bypass meanwhile, so a red CD on a
   push is expected noise, not a regression.
