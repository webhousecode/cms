#!/usr/bin/env bash
# F08.9 — PreToolUse deploy-guard (BLOCKING).
#
# Christian, 31/8: «Kan vi ikke få alle cardmem agenter til at køre en subagent
# til alt hvad der hedder udrulning og deployment, så den ikke står og er helt
# væk og vi ikke kan tale med den mens vi venter på at Deployment på 20 minutter
# er kørt færdig.»
#
# MÅLT på flådens egne transskripter (31/8, 12 sessioner):
#
#   flyctl deploy      985 kald   733 i FORGRUNDEN
#   gh run watch       538        377
#   xcodebuild          41         37
#   npm/pnpm publish    30         30
#   docker build/push   23         23
#   ─────────────────────────────────────────
#   I ALT             1.617      1.200   =  74 %
#
# 1.200 gange stod en session tavs mens ejeren ventede. En REGEL i CLAUDE.md
# ville have været påmindelsen; det her er PORTEN. Harness-kontrakten siger det
# selv: «en gate afhænger ikke af at en agent husker noget».
#
# Rettelsen er ét felt: run_in_background: true. Kommandoen kører videre på
# tværs af ture, sessionen bliver ved med at svare, og agenten vækkes når den er
# færdig.
#
# FEJLER ÅBENT. Kan hooken ikke afgøre noget — ingen jq, uparsbart input,
# manglende felt — TILLADER den kaldet. En vagt der spærrer arbejdet ved egen
# tvivl bliver slået fra, og så er den værre end ingen vagt.
#
# Input (stdin JSON fra cc): { tool_name, tool_input: { command?, run_in_background? } }
# Output ved blokering: begrundelse på stderr + exit 2 (cc's blokerings-kontrakt).

input=$(cat 2>/dev/null || true)
command -v jq >/dev/null 2>&1 || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
[ "$tool" = "Bash" ] || exit 0

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
[ -n "$cmd" ] || exit 0

# Kører den ALLEREDE i baggrunden? Så er der intet at rette.
bg=$(printf '%s' "$input" | jq -r '.tool_input.run_in_background // false' 2>/dev/null || echo "false")
[ "$bg" = "true" ] && exit 0

# HEREDOC-KROPPE UD FØRST. Et python/bash-script der NÆVNER «flyctl deploy» —
# fx det script der producerede tallene ovenfor — er ikke en udrulning. Målt:
# uden dette skridt matchede min egen måling sig selv.
# `sed` er LINJEBASERET, og det var ikke nok: «s/<<EOF.*$//» fjerner kun
# resten af MARKØR-linjen, ikke kroppen der følger på de næste linjer. Vagten
# blokerede derfor sin egen plan-doc, fordi dokumentets tekst indeholder
# «flyctl deploy» i en heredoc-krop. Fundet ved at den fyrede på mig selv —
# den bedste slags test.
#
# awk stopper ved FØRSTE heredoc-markør og kasserer alt derfra: kroppen er
# data, aldrig en kommando.
head=$(printf '%s\n' "$cmd" | awk '/<<[[:space:]]*'"'"'?[A-Za-z_][A-Za-z0-9_]*'"'"'?/{exit} {print}')
[ -n "$head" ] || exit 0

# HVERT LED FOR SIG. Dette var den bærende fejl i første udgave: både
# læse-undtagelsen og match kørte på HELE kommandoen, så
#
#   gh run watch 123 --exit-status ; gh run list --limit 1
#
# fritog sig selv — `gh run list` i anden halvdel slog undtagelsen til for
# første halvdel. 298 af 1.201 ægte forgrundskald slap forbi på præcis den form,
# og jeg gættede først på «cd» som årsag. Sporet ét konkret kald igennem i
# stedet, og det var undtagelsens rækkevidde.
#
# Nu splittes på ; && || | og linjeskift, og hvert led dømmes alene.
UDRULNING='^[[:space:]]*((cd|pushd)[[:space:]]+[^[:space:]]+[[:space:]]*)?([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*(nohup[[:space:]]+)?(fly(ctl)?[[:space:]]+deploy|gh[[:space:]]+run[[:space:]]+watch|docker[[:space:]]+(build|push)|(npm|pnpm)[[:space:]]+publish|xcodebuild|(eas|expo)[[:space:]]+build|vercel[[:space:]]+(deploy|--prod)|terraform[[:space:]]+apply)([[:space:]]|$)'

# Læse-varianter, dømt PR. LED — aldrig på hele strengen.
LAES='(^|[[:space:]])(--help|-h)([[:space:]]|$)|fly(ctl)?[[:space:]]+(status|logs|list|apps|secrets|certs|version)|gh[[:space:]]+run[[:space:]]+(list|view)|docker[[:space:]]+(images|ps)|npm[[:space:]]+(view|ls)'

hvad=""
while IFS= read -r led; do
  [ -n "$led" ] || continue
  printf '%s' "$led" | grep -qiE "$LAES" && continue
  if printf '%s' "$led" | grep -qiE "$UDRULNING"; then
    hvad=$(printf '%s' "$led" | grep -oiE 'fly(ctl)?[[:space:]]+deploy|gh[[:space:]]+run[[:space:]]+watch|docker[[:space:]]+(build|push)|(npm|pnpm)[[:space:]]+publish|xcodebuild|(eas|expo)[[:space:]]+build|vercel|terraform[[:space:]]+apply' | head -1)
    break
  fi
done < <(printf '%s\n' "$head" | sed -E 's/(\|\||&&|[;|])/\n/g' | sed -E 's/^[[:space:]]*//')

[ -n "$hvad" ] || exit 0

{
  printf 'F08.9 deploy-guard: kør «%s» i BAGGRUNDEN, ikke i forgrunden.\n\n' "$hvad"
  printf 'En udrulning i forgrunden gør sessionen tavs — ejeren kan ikke tale med\n'
  printf 'dig mens den kører, og en fly-deploy tager op mod 20 minutter.\n\n'
  printf 'Kør PRÆCIS samme kommando igen med:\n\n'
  printf '    run_in_background: true\n\n'
  printf 'Den kører videre på tværs af ture, sessionen bliver ved med at svare, og\n'
  printf 'du bliver vækket når den er færdig. Læs undervejs med Read på den\n'
  printf 'output-fil kaldet returnerer.\n\n'
  printf 'Skal den UNDTAGELSESVIS køre i forgrunden (kort kørsel du skal bruge\n'
  printf 'svaret på med det samme), så sig det til ejeren først — spærren er\n'
  printf 'bevidst uden en tavs bagdør.\n'
} >&2
exit 2
