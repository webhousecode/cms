#!/usr/bin/env bash
# F08.9 — proev deploy-vagten. Koeres af `pnpm test` via turbo (se package.json).
#
# Testen asserter ADFAERD, ikke eksistens: den fodrer det RIGTIGE script med
# rigtige kald og doemmer exit-koden. cardmems praecedens er grunden til at det
# staar her — deres scaffold-hooks-exist.test.ts asserterede at hook-FILEN
# fandtes, og en fil kan findes og vaere en no-op, uregistreret eller
# ikke-eksekverbar.
set -uo pipefail
# F149.9 — resolved from THIS FILE's own directory, not from a guessed repo root.
# The suite lives beside the hook it drives, because the fleet template applicator
# only delivers .claude/hooks, .claude/skills and settings.json — a copy in
# scripts/ was silently dropped for 28 repos, which shipped the gate without its
# test: exactly the "exists rather than works" defect the suite exists to prevent.
H="$(cd "$(dirname "$0")" && pwd)/pre-tool-use-deploy-background.sh"
[ -x "$H" ] || { echo "FEJL: $H findes ikke eller er ikke eksekverbar"; exit 1; }

fejl=0; blokeret=0
proev() { # navn forventet json
  printf '%s' "$3" | bash "$H" >/dev/null 2>&1
  local k=$?; local fik; [ $k -eq 2 ] && fik=BLOK || fik=TILLAD
  [ "$fik" = BLOK ] && blokeret=$((blokeret+1))
  if [ "$fik" = "$2" ]; then printf '  ok   %s\n' "$1"
  else printf '  FAIL %s — ventet %s, fik %s\n' "$1" "$2" "$fik"; fejl=$((fejl+1)); fi
}

echo "deploy-guard: skal BLOKERE"
proev "flyctl deploy"           BLOK '{"tool_name":"Bash","tool_input":{"command":"flyctl deploy -a buddy-brain"}}'
proev "cd && fly deploy"        BLOK '{"tool_name":"Bash","tool_input":{"command":"cd /x && fly deploy ."}}'
proev "deploy paa egen linje"   BLOK '{"tool_name":"Bash","tool_input":{"command":"cd /x\nflyctl deploy ."}}'
proev "env-praefiks"            BLOK '{"tool_name":"Bash","tool_input":{"command":"FLY_API_TOKEN=x flyctl deploy"}}'
proev "gh run watch"            BLOK '{"tool_name":"Bash","tool_input":{"command":"gh run watch 123 --exit-status"}}'
# SEGMENT-FAELDEN: 298 af 1.201 aegte kald slap paa netop denne form, fordi
# laese-undtagelsen blev vurderet paa HELE kommandoen.
proev "watch ; list (segment)"  BLOK '{"tool_name":"Bash","tool_input":{"command":"gh run watch 123 --exit-status >/dev/null 2>&1; gh run list --limit 1"}}'
proev "npm publish"             BLOK '{"tool_name":"Bash","tool_input":{"command":"cd packages/mail && npm publish --access public"}}'
proev "docker build"            BLOK '{"tool_name":"Bash","tool_input":{"command":"docker build -t x ."}}'
proev "xcodebuild"              BLOK '{"tool_name":"Bash","tool_input":{"command":"xcodebuild -scheme Buddy build"}}'

echo "deploy-guard: maa IKKE blokere"
proev "allerede i baggrund"     TILLAD '{"tool_name":"Bash","tool_input":{"command":"flyctl deploy -a x","run_in_background":true}}'
proev "commit-besked"           TILLAD '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"fix: flyctl deploy virkede ikke\""}}'
# HEREDOC: vagten blokerede sin egen plan-doc paa denne form. sed er
# linjebaseret og fjernede kun markoer-linjen; kroppen overlevede.
proev "heredoc-krop"            TILLAD '{"tool_name":"Bash","tool_input":{"command":"cat >> d.md <<XEOF\nflyctl deploy 985 kald\nXEOF"}}'
proev "fly status"              TILLAD '{"tool_name":"Bash","tool_input":{"command":"flyctl status -a x"}}'
# --help: AE i variabelnavnet LAES gjorde undtagelsen TOM, saa denne blokerede.
proev "deploy --help"           TILLAD '{"tool_name":"Bash","tool_input":{"command":"flyctl deploy --help"}}'
proev "gh run list alene"       TILLAD '{"tool_name":"Bash","tool_input":{"command":"gh run list --limit 5"}}'
proev "docker images"           TILLAD '{"tool_name":"Bash","tool_input":{"command":"docker images"}}'
# BEVIDST UDE: median 3 sek, og en commit skal fejle SYNLIGT.
proev "git commit"              TILLAD '{"tool_name":"Bash","tool_input":{"command":"git add -A && git commit -m x"}}'
proev "git push"                TILLAD '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
# fly ssh console er INTERAKTIV — den kan aldrig afslutte i baggrunden.
proev "fly ssh console"         TILLAD '{"tool_name":"Bash","tool_input":{"command":"flyctl ssh console -a x"}}'
proev "ikke-Bash"               TILLAD '{"tool_name":"Read","tool_input":{"file_path":"/x/deploy.md"}}'
proev "tomt input"              TILLAD '{}'
proev "uparsbart input"         TILLAD 'ikke json'

# SCOPE. Uden denne ville en vagt der ALDRIG blokerer bestaa hver eneste
# praecisions-proeve ovenfor. «0 forkerte» og «0 undersoegte» ser ens ud.
if [ "$blokeret" -lt 5 ]; then
  echo "  FAIL SCOPE: kun $blokeret blev blokeret — vagten porter ikke"; fejl=$((fejl+1))
else
  echo "  ok   SCOPE: $blokeret kald blev faktisk blokeret"
fi

if [ "$fejl" -eq 0 ]; then echo "deploy-guard: alle bestod"; exit 0
else echo "deploy-guard: $fejl fejlede"; exit 1; fi
