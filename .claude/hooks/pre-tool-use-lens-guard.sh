#!/usr/bin/env bash
# F112 — PreToolUse lens-guard (advisory, NON-BLOCKING).
#
# Nudges a session toward Cardmem Lens the moment it reaches for raw
# Playwright/Puppeteer for browser work. It NEVER blocks the tool call
# (always exit 0) — its value is a visible reminder at the point of the reach,
# per the F112 HARD RULE: "Browser automation = Cardmem Lens, never raw Playwright."
#
# Inputs (stdin JSON from cc): { tool_name, tool_input: { command?, file_path?, content?, new_string? } }
# Output: on a detected reach, a hookSpecificOutput.additionalContext reminder
#         (injected into context); otherwise nothing. Exit 0 either way.

input=$(cat 2>/dev/null || true)
command -v jq >/dev/null 2>&1 || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")

case "$tool" in
  Bash)  text=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "") ;;
  Write) text=$(printf '%s' "$input" | jq -r '(.tool_input.file_path // "") + " " + (.tool_input.content // "")' 2>/dev/null || echo "") ;;
  Edit)  text=$(printf '%s' "$input" | jq -r '(.tool_input.file_path // "") + " " + (.tool_input.new_string // "")' 2>/dev/null || echo "") ;;
  *) exit 0 ;;
esac
[ -z "$text" ] && exit 0

# An ACTUAL raw browser-automation reach (execution / import / launch), not a
# passing mention. Matches: a runner invoking playwright/puppeteer, a
# playwright sub-command, an import of the lib, or a direct browser .launch().
if ! printf '%s' "$text" | grep -qiE '(npx|pnpm|bunx|yarn|node|bun)[^|&;]*(playwright|puppeteer)|playwright +(test|codegen|open|screenshot)|(require\(|from +)["'\''](playwright|puppeteer)|(chromium|webkit|firefox)\.launch'; then
  exit 0
fi

# Exclude legitimate infra — these are NOT the anti-pattern:
#  - the cardmem daemon IS the Playwright host (apps/agent)
#  - installs (playwright install), node_modules, the repo's own auth-setup tests
#  - the Lens tools/manifest themselves
if printf '%s' "$text" | grep -qiE 'install|apps/agent|node_modules|tests?/setup|auth\.setup|lens\.manifest|cardmem-lens|lens_(verify|capture|run_flow|run_manuscript|gate)'; then
  exit 0
fi

# F112.1 — RUNNING THE REPO'S OWN COMMITTED SUITE IS NOT THE ANTI-PATTERN.
# Reported by cms (#21949) after it fired four times while they repaired their
# own Tests workflow, whose E2E job IS `npx playwright test` on a committed
# suite. That is the same act as `npx vitest run`: executing the project's gate,
# not hand-rolling browser automation.
#
# The distinction that matters, and why this is not a loophole: F112 exists so a
# session reaches for Lens INSTEAD OF writing its own one-off script. A repo that
# already has a Playwright-based CI gate is not in conflict with that — and the
# worse reading is the one cms names: a session could take the rule to mean
# "replace the repo's test job with Lens" and tear the gate down. A gate someone
# removes is worse than a gate that is red.
#
# Discriminator: the SUITE RUNNER (`playwright test`) plus a COMMITTED config in
# this repo. `codegen`/`open`/`screenshot`, an inline script, or an import still
# nag — those are the actual reach. Committing a config to dodge the nudge is a
# visible, reviewable act, which a one-off script is not.
# The config is not always at the repo root — cardmem's own lives at
# apps/web/playwright.config.ts — so the search is bounded (depth 3, no
# node_modules) rather than root-only. Root-only was the first version and it
# still fired on this very repo: the check has to look where configs actually are.
if printf '%s' "$text" | grep -qiE '(^|[^a-z-])playwright +test([^a-z-]|$)'; then
  if find . -maxdepth 3 -name 'playwright.config.*' \
       -not -path '*/node_modules/*' -not -path './.claude/worktrees/*' \
       -print -quit 2>/dev/null | grep -q .; then
    exit 0
  fi
fi

reminder="$(cat <<'EOF'
⚠️ Cardmem Lens, not raw Playwright (HARD RULE F112). You appear to be reaching for raw Playwright/Puppeteer. Use Cardmem Lens instead — the cardmem-lens MCP (lens_verify / lens_capture / lens_run_flow / lens_run_manuscript) or the daemon at 127.0.0.1:7475. The daemon owns the browser, so anything you would script with Playwright, Lens can do BY PROXY. If Lens cannot do it 100%, do NOT work around it with a one-off script — file a Lens capability request (cardmem_capture_idea tagged "lens-gap", or ask the cardmem session via intercom), then use it. See .claude/skills/lens.md.
EOF
)"

jq -nc --arg ctx "$reminder" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}' 2>/dev/null || true
exit 0
