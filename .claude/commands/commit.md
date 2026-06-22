---
description: Stage and commit the working tree with a clear conventional message — no push.
argument-hint: "[optional subject/focus]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git restore:*)
---

Commit the current working tree. **Do NOT push.**

1. Run `git status` and `git diff` (both staged and unstaged) so you see exactly what changed.
2. Decide ONE clear commit message in this repo's convention — `type(F<n>): subject`
   when the work maps to an F-number (`feat`/`fix`/`docs`/`refactor`/`chore`), otherwise
   `type: subject`. If `$ARGUMENTS` is given, use it as the subject/focus.
3. Stage the real changes (`git add <paths>`). **EXCLUDE:**
   - secrets and gitignored files (`.env`, `.lens-mint-secret`, anything under `.gitignore`),
   - local-only deploy-bypass scaffolding that would break CI: `Dockerfile.prebuilt`,
     the `fly.toml` `[build] dockerfile = "Dockerfile.prebuilt"` line, and the
     `.dockerignore` `!apps/web/dist` negation. If a `fly.toml` / `.dockerignore` change
     is ONLY that temp line, don't stage that file; otherwise stage just the real hunks.
   Call out anything you deliberately left out.
4. Commit with the message, ending with this trailer:

   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
5. Show `git log -1 --stat`. Do not push — that's `/commit+push` (or its alias `/cp`).
