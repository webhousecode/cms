# F85 — Claude Code Hooks & Quality Gates

> Automated quality enforcement using Claude Code hooks — type-checking, linting, UI pattern validation, and destructive command guards.

## Problem

Claude Code sessions repeatedly produce errors that could be caught automatically: TypeScript compilation failures after edits, wrong UI patterns (e.g. "Sure?" instead of "Remove? [Yes] [No]"), destructive bash commands without explicit user request, and missing convention compliance. These errors waste time, compute, and user patience — the user has corrected the inline confirm pattern 5+ times.

## Solution

Configure Claude Code hooks in `.claude/settings.json` to run automated checks at key points: post-edit TypeScript compilation, pre-bash destructive command detection, and post-commit code audit. Hooks are shell scripts that output warnings/errors into the CC context, catching issues before the user sees them.

## Technical Design

### Hook 1: Post-Edit Type Check

Runs `tsc --noEmit` after every Edit/Write to a `.ts`/`.tsx` file. Catches compilation errors immediately.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bash .claude/hooks/post-edit-typecheck.sh"
      }
    ]
  }
}
```

Script: `.claude/hooks/post-edit-typecheck.sh`
- Checks if the edited file is in `packages/cms-admin/`
- Runs `npx tsc --noEmit --project packages/cms-admin/tsconfig.json 2>&1 | head -20`
- Outputs errors if any, empty output if clean

### Hook 2: Pre-Bash Destructive Guard

Warns before destructive bash commands (rm -rf, git reset --hard, DROP TABLE, etc.).

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "bash .claude/hooks/pre-bash-guard.sh"
      }
    ]
  }
}
```

Script: `.claude/hooks/pre-bash-guard.sh`
- Receives the command via stdin/env
- Pattern-matches against destructive patterns: `rm -rf`, `git reset --hard`, `git push --force`, `DROP TABLE`, `kill`, `pkill`
- Outputs warning if matched, empty if safe

### Hook 3: Post-Commit Audit

Runs after git commits to verify nothing broke.

Script: `.claude/hooks/post-commit-audit.sh`
- Runs TypeScript compilation
- Counts TODO/FIXME added in the commit
- Reports summary

### Future Hooks (not in v1)

- **Pre-Edit UI Pattern Validator**: grep new code for anti-patterns ("Sure?", `window.confirm`, native `<select>`)
- **Post-Write Lint**: run ESLint on changed files
- **Playwright Smoke Test**: run critical path tests after major changes

## Impact Analysis

### Files affected
- `.claude/settings.json` — new, hook configuration (project-level)
- `.claude/hooks/post-edit-typecheck.sh` — new, type-check script
- `.claude/hooks/pre-bash-guard.sh` — new, destructive command guard
- `.claude/hooks/post-commit-audit.sh` — new, post-commit verification

### Downstream dependents
No existing files modified — all new files.

### Blast radius
- Hooks run on every tool call matching the pattern — slow hooks block CC workflow
- Type-check hook must be fast (<5s) or it becomes annoying
- Guard hook must not block legitimate destructive commands that the user explicitly requested
- False positives in guards erode trust

### Breaking changes
None — purely additive.

### Test plan
- [ ] Post-edit hook fires after editing a .tsx file
- [ ] Post-edit hook catches a deliberate type error
- [ ] Pre-bash hook warns on `rm -rf /tmp/test`
- [ ] Pre-bash hook does NOT warn on `rm single-file.txt`
- [ ] Post-commit hook runs and reports clean
- [ ] Hooks don't add >3s to each operation

## Implementation Steps

1. Create `.claude/hooks/` directory
2. Write `post-edit-typecheck.sh` — fast tsc check scoped to cms-admin
3. Write `pre-bash-guard.sh` — regex matcher for destructive patterns
4. Write `post-commit-audit.sh` — tsc + TODO count
5. Configure hooks in `.claude/settings.json`
6. Test each hook in a live CC session
7. Tune timeouts and patterns based on real usage


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies
- None — uses only Claude Code built-in hook system and existing tooling (tsc, bash)

## Effort Estimate
**Small** — 1 day

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
