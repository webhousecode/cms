#!/usr/bin/env bash
# F287.3 — prove the kill switch, in BOTH directions.
#
# Two claims, and the second one is the load-bearing half:
#   1. A disabled rule really stops firing.  (the feature)
#   2. Every DOUBT still lets the rule fire. (the safety)
#
# (2) is why this file exists. A kill switch is a hole in a safety gate by
# design, so the ways it can be opened by ACCIDENT are the ways it kills someone
# — a missing file, a truncated write, no jq, a string where a list belongs.
# Each of those is a separate case below, and each must still BLOCK.
#
# Drives the REAL hook with real stdin and judges the exit code. It runs against
# a throwaway copy of the hooks directory so a live rules.local.json on this
# machine cannot make the suite pass or fail for the wrong reason — the bug this
# shape prevents is a test that measured the developer's laptop.
set -uo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/.claude/hooks"
cp "$SRC/pre-tool-use-deploy-background.sh" "$SRC/_common.sh" "$WORK/.claude/hooks/"
chmod +x "$WORK/.claude/hooks/pre-tool-use-deploy-background.sh"
H="$WORK/.claude/hooks/pre-tool-use-deploy-background.sh"
RULES="$WORK/.claude/rules.local.json"
DEPLOY='{"tool_name":"Bash","tool_input":{"command":"flyctl deploy -a cardmem"}}'

fejl=0
proev() { # navn forventet [PATH-override]
  local k fik
  CLAUDE_PROJECT_DIR="$WORK" PATH="${3:-$PATH}" bash -c 'printf "%s" "$1" | bash "$2" >/dev/null 2>&1' _ "$DEPLOY" "$H"
  k=$?; [ $k -eq 2 ] && fik=BLOK || fik=TILLAD
  if [ "$fik" = "$2" ]; then printf '  ok   %s\n' "$1"
  else printf '  FAIL %s — ventet %s, fik %s\n' "$1" "$2" "$fik"; fejl=$((fejl+1)); fi
}

echo "rules kill-switch: POSITIVE CONTROL — with no kill list the gate blocks"
rm -f "$RULES"
proev "no rules file at all"                       BLOK

echo
echo "rules kill-switch: the switch WORKS"
echo '{"disabled":["deploy-background"]}' > "$RULES"
proev "the rule is disabled"                       TILLAD

echo
echo "rules kill-switch: every DOUBT keeps the gate ON"
echo '{"disabled":[]}'                    > "$RULES"; proev "empty list"                    BLOK
echo '{"disabled":["lens-guard"]}'        > "$RULES"; proev "a DIFFERENT rule disabled"     BLOK
echo '{"disabled":["deploy"]}'            > "$RULES"; proev "a PREFIX of the id"            BLOK
echo '{"disabled":["deploy-background-x"]}' > "$RULES"; proev "the id as a prefix"          BLOK
echo '{"disabled":"deploy-background"}'   > "$RULES"; proev "disabled is a string"          BLOK
echo '{"disabled":{"deploy-background":true}}' > "$RULES"; proev "disabled is an object"    BLOK
echo '{"nope":["deploy-background"]}'     > "$RULES"; proev "no disabled key"               BLOK
echo '{"disabled":["deploy-backgroun'     > "$RULES"; proev "truncated write (half a file)" BLOK
echo 'not json at all'                    > "$RULES"; proev "not JSON"                      BLOK
: > "$RULES";                                          proev "empty file"                   BLOK

echo '{"disabled":["deploy-background"]}' > "$RULES"
chmod 000 "$RULES" 2>/dev/null
if [ -r "$RULES" ]; then
  printf '  skip unreadable file — running as a user who can read 000\n'
else
  proev "unreadable file"                                                                   BLOK
fi
chmod 644 "$RULES" 2>/dev/null

# jq gone — and ONLY jq.
#
# The first version of this case set PATH=/nonexistent, which also removed
# `bash`, so nothing ran at all and the case passed having measured NOTHING. A
# stripped PATH is a blunt instrument: it takes the thing you meant AND the
# thing running the test. So build a PATH that has everything except jq.
# Only what the gate actually shells out to, resolved from the REAL PATH. A
# symlink farm over every bin directory also worked and took ~30s per run — this
# suite ships to thirty repos and runs in CI, so it is worth the explicit list.
mkdir -p "$WORK/bin"
for n in bash sh grep awk sed head cat tr basename dirname cut printf env; do
  b="$(command -v "$n" 2>/dev/null)" || continue
  [ -n "$b" ] && ln -sf "$b" "$WORK/bin/$n"
done
# Prove the premise before trusting the result: jq must actually be gone, and
# bash must actually still be there. Without this the case can silently go back
# to measuring nothing.
if PATH="$WORK/bin" command -v jq >/dev/null 2>&1; then
  printf '  FAIL jq-missing setup — jq is still on the stripped PATH\n'; fejl=$((fejl+1))
elif ! PATH="$WORK/bin" command -v bash >/dev/null 2>&1; then
  printf '  FAIL jq-missing setup — bash is missing too, the case would measure nothing\n'; fejl=$((fejl+1))
else
  echo '{"disabled":["deploy-background"]}' > "$RULES"
  # The gate's OWN documented fail-open (no jq -> allow) fires here, so the exit
  # code cannot distinguish the two. What this asserts is the thing that would
  # actually hurt: rule_disabled must not error, and must not report a disable it
  # cannot verify. Checked on the same input that IS disabled when jq is present.
  out=$(CLAUDE_PROJECT_DIR="$WORK" PATH="$WORK/bin" "$WORK/bin/bash" -c 'printf "%s" "$1" | bash "$2" 2>&1' _ "$DEPLOY" "$H")
  if printf '%s' "$out" | grep -qi 'rule_disabled\|not found\|syntax error'; then
    printf '  FAIL jq missing — rule_disabled misbehaved: %s\n' "$out"; fejl=$((fejl+1))
  else
    printf '  ok   jq missing — no crash, and a disable it cannot verify is not honoured\n'
  fi
  # And the direct assertion, with jq back: rule_disabled says NO when it cannot read.
  ( set +u; . "$WORK/.claude/hooks/_common.sh"
    CLAUDE_PROJECT_DIR="$WORK" PATH="$WORK/bin" rule_disabled "deploy-background" ) \
    && { printf '  FAIL rule_disabled returned TRUE without jq\n'; fejl=$((fejl+1)); } \
    || printf '  ok   rule_disabled returns false when it cannot read the list\n'
fi


echo
echo "rules kill-switch: the WRITE side (write_rules_local)"
( set +u; . "$WORK/.claude/hooks/_common.sh"

w() { # navn result-json forventet-filindhold-eller-UNCHANGED
  local got
  got=$(write_rules_local "$2" "$WORK/.claude")
  local content; content=$(cat "$RULES" 2>/dev/null || echo "<none>")
  if [ "$3" = UNCHANGED ]; then
    if [ "$content" = "$4" ]; then printf '  ok   %s\n' "$1"
    else printf '  FAIL %s — filen blev ændret til %s\n' "$1" "$content"; exit 1; fi
  elif [ "$content" = "$3" ]; then printf '  ok   %s\n' "$1"
  else printf '  FAIL %s — ventet %s, fik %s\n' "$1" "$3" "$content"; exit 1; fi
}

rm -f "$RULES"
w "a disabled rule is written"      '{"disabled_rules":["deploy-background"]}'  '{"disabled":["deploy-background"]}'
# THE STALE-FILE CASE. An empty list must OVERWRITE, not be skipped — otherwise
# the previous project's list stays and its rules remain off here.
w "an EMPTY list clears the file"   '{"disabled_rules":[]}'                     '{"disabled":[]}'
w "and a rule can be set again"     '{"disabled_rules":["lens-guard"]}'         '{"disabled":["lens-guard"]}'
# ABSENT is not EMPTY: an older server cannot say "nothing is disabled", and
# reading its silence as a clear would re-enable a rule the owner turned off.
w "an ABSENT field leaves it alone" '{"active_project":{"id":"p1"}}'            UNCHANGED '{"disabled":["lens-guard"]}'
w "unparseable result leaves it alone" 'not json'                               UNCHANGED '{"disabled":["lens-guard"]}'
) || fejl=$((fejl+1))

echo
if [ $fejl -eq 0 ]; then echo "rules kill-switch: alle proever ok"; else echo "rules kill-switch: $fejl FEJL"; fi
exit $fejl
