#!/usr/bin/env bash
# F08.9 — proev deploy-vagten. Koeres af `pnpm test` via turbo (se package.json).
#
# Testen asserter ADFAERD, ikke eksistens: den fodrer det RIGTIGE script med
# rigtige kald og doemmer exit-koden. cardmems praecedens er grunden til at det
# staar her — deres scaffold-hooks-exist.test.ts asserterede at hook-FILEN
# fandtes, og en fil kan findes og vaere en no-op, uregistreret eller
# ikke-eksekverbar.
set -uo pipefail
H="$(cd "$(dirname "$0")" && pwd)/pre-tool-use-deploy-background.sh"
[ -x "$H" ] || { echo "FEJL: $H findes ikke eller er ikke eksekverbar"; exit 1; }

fejl=0; blokeret=0; med_udvej=0
# Vagten BLOKERER (exit 2) — ejerens valg 31/8: «den maa godt blokkes, men
# jobbet maa jo ikke gaa i staa». Derfor asserteres BEGGE halvdele: at den
# spaerrer, OG at beskeden navngiver vejen videre. En spaerre uden en vej
# videre er en arbejdsstandsning, ikke en port.
proev() { # navn forventet json
  local ud; ud=$(printf '%s' "$3" | bash "$H" 2>&1 >/dev/null)
  local k=$?; local fik; [ $k -eq 2 ] && fik=RAAD || fik=TAVS
  if [ "$fik" = RAAD ]; then
    blokeret=$((blokeret+1))
    # cardmem (F149.11) skaerpede denne: det er ikke nok at ORDET staar der.
    # En besked der navngiver udvejen for «flyctl deploy» men ikke for
    # «xcodebuild» er samme fejl een gren laengere ude. Saa der kraeves BEGGE
    # dele — rettelsen OG hvad der blev fanget.
    case "$ud" in *run_in_background*) :;;
      *) printf '  FAIL %s — blokerede UDEN at navngive rettelsen\n' "$1"; fejl=$((fejl+1)); return;;
    esac
    case "$ud" in *«*»*) :;;
      *) printf '  FAIL %s — blokerede uden at sige HVAD der blev fanget\n' "$1"; fejl=$((fejl+1)); return;;
    esac
    med_udvej=$((med_udvej+1))
  fi
  if [ "$fik" = "$2" ]; then printf '  ok   %s\n' "$1"
  else printf '  FAIL %s — ventet %s, fik %s\n' "$1" "$2" "$fik"; fejl=$((fejl+1)); fi
}

echo "deploy-guard: skal RAADE"
proev "flyctl deploy"           RAAD '{"tool_name":"Bash","tool_input":{"command":"flyctl deploy -a buddy-brain"}}'
proev "cd && fly deploy"        RAAD '{"tool_name":"Bash","tool_input":{"command":"cd /x && fly deploy ."}}'
proev "deploy paa egen linje"   RAAD '{"tool_name":"Bash","tool_input":{"command":"cd /x\nflyctl deploy ."}}'
proev "env-praefiks"            RAAD '{"tool_name":"Bash","tool_input":{"command":"FLY_API_TOKEN=x flyctl deploy"}}'
proev "gh run watch"            RAAD '{"tool_name":"Bash","tool_input":{"command":"gh run watch 123 --exit-status"}}'
# SEGMENT-FAELDEN: 298 af 1.201 aegte kald slap paa netop denne form, fordi
# laese-undtagelsen blev vurderet paa HELE kommandoen.
proev "watch ; list (segment)"  RAAD '{"tool_name":"Bash","tool_input":{"command":"gh run watch 123 --exit-status >/dev/null 2>&1; gh run list --limit 1"}}'
proev "npm publish"             RAAD '{"tool_name":"Bash","tool_input":{"command":"cd packages/mail && npm publish --access public"}}'
proev "docker build"            RAAD '{"tool_name":"Bash","tool_input":{"command":"docker build -t x ."}}'
proev "xcodebuild"              RAAD '{"tool_name":"Bash","tool_input":{"command":"xcodebuild -scheme Buddy build"}}'

echo "deploy-guard: skal vaere TAVS"
proev "allerede i baggrund"     TAVS   '{"tool_name":"Bash","tool_input":{"command":"flyctl deploy -a x","run_in_background":true}}'
proev "commit-besked"           TAVS   '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"fix: flyctl deploy virkede ikke\""}}'
# HEREDOC: vagten blokerede sin egen plan-doc paa denne form. sed er
# linjebaseret og fjernede kun markoer-linjen; kroppen overlevede.
proev "heredoc-krop"            TAVS   '{"tool_name":"Bash","tool_input":{"command":"cat >> d.md <<XEOF\nflyctl deploy 985 kald\nXEOF"}}'
proev "fly status"              TAVS   '{"tool_name":"Bash","tool_input":{"command":"flyctl status -a x"}}'
# --help: AE i variabelnavnet LAES gjorde undtagelsen TOM, saa denne blokerede.
proev "deploy --help"           TAVS   '{"tool_name":"Bash","tool_input":{"command":"flyctl deploy --help"}}'
proev "gh run list alene"       TAVS   '{"tool_name":"Bash","tool_input":{"command":"gh run list --limit 5"}}'
proev "docker images"           TAVS   '{"tool_name":"Bash","tool_input":{"command":"docker images"}}'
# BEVIDST UDE: median 3 sek, og en commit skal fejle SYNLIGT.
proev "git commit"              TAVS   '{"tool_name":"Bash","tool_input":{"command":"git add -A && git commit -m x"}}'
proev "git push"                TAVS   '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}'
# fly ssh console er INTERAKTIV — den kan aldrig afslutte i baggrunden.
proev "fly ssh console"         TAVS   '{"tool_name":"Bash","tool_input":{"command":"flyctl ssh console -a x"}}'
proev "ikke-Bash"               TAVS   '{"tool_name":"Read","tool_input":{"file_path":"/x/deploy.md"}}'
proev "tomt input"              TAVS   '{}'
proev "uparsbart input"         TAVS   'ikke json'

echo "F08.10 — VENTEPOSITIONEN er egenskaben, ikke vaerktoejet"
# Christian saa PRAECIS denne kommando staa stille 7 min 10 sek i fd-sundhed.
# F08.9-vagten blokerede 28 af 2.368 aegte vente-loekker (1,2 %).
proev "fd-sundheds 7m10s-loekke"  RAAD '{"tool_name": "Bash", "tool_input": {"command": "for i in $(seq 1 14); do s=$(gh run list --workflow=deploy.yml -L 1 --json status,conclusion -q '"'"'.[]'"'"'); case \"$s\" in *completed*) echo \"$s\"; break;; *) sleep 45;; esac; done", "run_in_background": false}}'
proev "while true + sleep 2"      RAAD '{"tool_name": "Bash", "tool_input": {"command": "while true; do curl -s localhost:3000 && break; sleep 2; done", "run_in_background": false}}'
proev "until + sleep 3"           RAAD '{"tool_name": "Bash", "tool_input": {"command": "until curl -sf localhost:3000; do sleep 3; done", "run_in_background": false}}'
proev "while + sleep 30"          RAAD '{"tool_name": "Bash", "tool_input": {"command": "while ! nc -z db 5432; do sleep 30; done", "run_in_background": false}}'
# KOMMANDO-SUBSTITUTION: slap HELT igennem F08.9 (maalt af components).
# UDRULNINGs tildelings-led kraever mellemrum efter =, og OUT=$(flyctl har ingen.
proev 'OUT=\$(flyctl deploy)'     RAAD '{"tool_name": "Bash", "tool_input": {"command": "OUT=$(flyctl deploy -a x); echo \"$OUT\"", "run_in_background": false}}'
proev "backtick flyctl deploy"    RAAD '{"tool_name": "Bash", "tool_input": {"command": "OUT=`flyctl deploy -a x`; echo done", "run_in_background": false}}'

echo "F08.10 — skal vaere TAVS"
# KORTE RETRY-LOEKKER: 845 kald for kun 4,9 t — 39 % af kaldene, 12 % af tiden.
# At spaerre dem ville irritere konstant og spare naesten intet.
proev "kort retry sleep 2"        TAVS   '{"tool_name": "Bash", "tool_input": {"command": "for i in 1 2 3; do curl -sf x.dk && break; sleep 2; done", "run_in_background": false}}'
proev "kort retry sleep 4"        TAVS   '{"tool_name": "Bash", "tool_input": {"command": "for i in $(seq 1 5); do ping -c1 a.dk && break; sleep 4; done", "run_in_background": false}}'
# NAEVNELSE ER IKKE KOERSEL. Meldt af ai-sdk, components og Christian paa under
# to timer: et grep EFTER moensteret blev blokeret.
proev "grep efter moensteret"     TAVS   '{"tool_name": "Bash", "tool_input": {"command": "grep -qE '"'"'^(flyctl deploy|xcodebuild|npm publish)'"'"' fil.txt", "run_in_background": false}}'
proev "sed i en doc"              TAVS   '{"tool_name": "Bash", "tool_input": {"command": "sed -i '"'"''"'"' '"'"'s/flyctl deploy/fly deploy/'"'"' docs/x.md", "run_in_background": false}}'
# Hurtig, read-only, validerer en tarball.
proev "npm publish --dry-run"     TAVS   '{"tool_name": "Bash", "tool_input": {"command": "npm publish --dry-run", "run_in_background": false}}'
# KONTROL: en dobbelt-citeret streng er IKKE data — bash -c koerer den.
proev 'bash -c dobbeltciteret'    RAAD '{"tool_name": "Bash", "tool_input": {"command": "bash -c \"flyctl deploy -a x\"", "run_in_background": false}}'
proev "sleep uden loekke"         TAVS   '{"tool_name": "Bash", "tool_input": {"command": "sleep 30 && echo faerdig", "run_in_background": false}}'
proev "loekke uden sleep"         TAVS   '{"tool_name": "Bash", "tool_input": {"command": "for f in *.ts; do echo \"$f\"; done", "run_in_background": false}}'

echo "F08.10 — INDESLUTNING + KOMMANDO-POSITION (components' otte + de forudsagte)"
# components maalte otte former og viste at det var EET hul: vagten saa kun
# OEVERSTE niveau af en flad kommandolinje. De fraraadede udtrykkeligt at
# tilfoeje then|do|eval|xargs til ankeret — det ville lukke de otte former de
# kom i tanke om, ikke klassen. De to sidste her stod i DERES forudsigelse om
# hvad der saa ville komme; ingen af dem er skrevet ind som moenstre.
proev "nest: if..then"        RAAD '{"tool_name": "Bash", "tool_input": {"command": "if true; then flyctl deploy; fi"}}'
proev "nest: for..do"         RAAD '{"tool_name": "Bash", "tool_input": {"command": "for a in a1 a2; do flyctl deploy -a $a; done"}}'
proev "nest: xargs -I{}"      RAAD '{"tool_name": "Bash", "tool_input": {"command": "echo a1 | xargs -I{} flyctl deploy -a {}"}}'
proev "nest: eval"            RAAD '{"tool_name": "Bash", "tool_input": {"command": "eval \"flyctl deploy --remote-only\""}}'
proev "nest: nohup &"         RAAD '{"tool_name": "Bash", "tool_input": {"command": "nohup flyctl deploy &"}}'
proev "nest: time"            RAAD '{"tool_name": "Bash", "tool_input": {"command": "time flyctl deploy -a x"}}'

echo "F08.10 — NAEVNELSE er ikke KOERSEL (den nye risiko ved indeslutning)"
# components' egen advarsel: «en falsk positiv paa en git add er vaerre end en
# falsk negativ paa en eval, fordi den foerste rammer hver dag.» Ren
# indeslutning blokerede alle fire nederste; kommando-position lukkede dem.
proev "git add filnavn m. bindestreg" TAVS   '{"tool_name": "Bash", "tool_input": {"command": "git add docs/flyctl-deploy-notes.md"}}'
proev "grennavn gh-run-watch"         TAVS   '{"tool_name": "Bash", "tool_input": {"command": "git checkout -b fix/gh-run-watch-timeout"}}'
proev "awk-moenster"                  TAVS   '{"tool_name": "Bash", "tool_input": {"command": "awk '"'"'/flyctl deploy/ {print}'"'"' fil"}}'
proev "find -name dobbeltciteret"     TAVS   '{"tool_name": "Bash", "tool_input": {"command": "find . -name \"*docker build*\""}}'
proev "echo (bar naevnelse)"          TAVS   '{"tool_name": "Bash", "tool_input": {"command": "echo flyctl deploy"}}'
proev "git log --grep="               TAVS   '{"tool_name": "Bash", "tool_input": {"command": "git log --grep=flyctl deploy --oneline"}}'
proev "rg uciteret"                   TAVS   '{"tool_name": "Bash", "tool_input": {"command": "rg -n flyctl deploy src/"}}'
proev "ls | grep xcodebuild"          TAVS   '{"tool_name": "Bash", "tool_input": {"command": "ls docs | grep xcodebuild"}}'

echo "F08.10 — timeout-praefikset (fundet i MIN EGEN maaling, ikke af en peer)"
# Da jeg klassificerede hvad vagten LOD SLIPPE, var 3 af 14 stikproever aegte
# udrulninger paa formen `timeout N <kommando>`. timeout ER kommando-position i
# praksis, men tager et ARGUMENT foer kommandoen, saa noegleords-moensteret ramte
# forbi. Maalingen af hvad der slap igennem fandt altsaa et hul som hverken jeg
# eller tre peers havde taenkt paa — argumentet for at maale de TILLADTE, ikke
# kun de blokerede.
proev "timeout N + gh run watch"  RAAD '{"tool_name": "Bash", "tool_input": {"command": "cd /x && timeout 300 gh run watch 271 --exit-status 2>&1 | tail -15"}}'
proev "timeout N + flyctl deploy" RAAD '{"tool_name": "Bash", "tool_input": {"command": "cd /x && timeout 200 flyctl deploy --local-only --app cardmem 2>&1"}}'
proev "timeout N + gh run LIST"   TAVS '{"tool_name": "Bash", "tool_input": {"command": "timeout 30 gh run list --limit 1"}}'

# VAGT MOD DEN DYRESTE FEJL I DENNE FIL (31/8): et testnavn stod i DOBBELTE
# anfoerselstegn — proev "OUT=$(flyctl deploy)" — og bash udfoerte
# substitutionen i NAVNET. Det udrullede buddy-cloud til produktion (v202),
# uden ordre, midt i en testkoersel. Ingen serverkode var aendret, saa skaden
# blev nul, men mekanismen er den samme uanset held.
#
# Et testnavn er DATA. Denne vagt fejler hvis nogen nogensinde skriver et
# navn der kan udfoeres.
if grep -vE '^[[:space:]]*#' "$0" | grep -nE 'proev[[:space:]]+"[^"]*(\$\(|`)' >&2; then
  echo "  FAIL et testnavn i dobbelte anfoerselstegn indeholder \$( eller backtick — bash UDFOERER det"
  fejl=$((fejl+1))
else
  echo "  ok   ingen eksekverbare testnavne"
fi
if [ "$med_udvej" -ne "$blokeret" ] || [ "$med_udvej" -lt 5 ]; then
  echo "  FAIL UDVEJ-SCOPE: $med_udvej af $blokeret blokeringer bar en udvej"; fejl=$((fejl+1))
else
  echo "  ok   UDVEJ-SCOPE: alle $med_udvej blokeringer navngav rettelsen OG fundet"
fi
# SCOPE. Uden denne ville en vagt der ALDRIG blokerer bestaa hver eneste
# praecisions-proeve ovenfor. «0 forkerte» og «0 undersoegte» ser ens ud.

# ─── cardmems egne caser, oven paa buddys 44 ─────────────────────────
#
# Fire former vi maalte som vores og som deres suite ikke havde. Den foerste er
# den vigtigste: `ssh -p 22 vaert "..."` — et flag med en VAERDI. Deres
# udtraek forventede praecis ét ord mellem ssh og citatet, saa `-p 22 host`
# faldt udenfor. ssh er den form hvor tavsheden kommer fra en ANDEN maskine.
#
# De to ucitrede blev fundet ved at en mutation IKKE gik roed: da kommando-
# positions-testen blev fjernet, bestod suiten stadig, fordi alle dens falske
# positiver var citerede. Hullet var i TESTEN.
proev 'ssh med flag + argument'          RAAD    '{"tool_name": "Bash", "tool_input": {"command": "ssh -p 22 host \"flyctl deploy -a prod\""}}'
proev 'ekko med ordene ucitrede'         TAVS  '{"tool_name": "Bash", "tool_input": {"command": "echo koer flyctl deploy bagefter"}}'
proev 'grep paa et ucitret ord'          TAVS  '{"tool_name": "Bash", "tool_input": {"command": "history | grep xcodebuild"}}'
proev 'heredoc: ordet forrest paa linjen' TAVS  '{"tool_name": "Bash", "tool_input": {"command": "cat > plan.md <<'"'"'EOF'"'"'\\nWe run flyctl deploy nightly.\\nflyctl deploy -a prod\\nEOF"}}'


# ─── EN PIPE I DATA ER IKKE EN PIPELINE (cms, #24357) ────────────────
#
# cms meldte den mens den stod i hele flaaden: 1.7.x splittede paa | uden at
# kende citater, saa pipen INDE i et soegemoenster blev en ledseparator og
# fragmentet bagefter saa ud som en kommando.
#
# Deres skarpeste pointe var ikke den enkelte falske alarm, men at vagten
# modsagde sin EGEN erklaerede kontrakt: hovedet siger «fejler aabent — kan den
# ikke afgoere noget, tillader den», og her fejlede den LUKKET paa praecis den
# tvivl. En vagt der spaerrer arbejde ved egen tvivl bliver slaaet fra.
#
# Deres foerste linje er den vigtigste her: den er en ORDRET regression fra
# produktion, ikke en konstrueret case.
proev 'cms: grep over en workflow-fil'   TAVS    '{"tool_name": "Bash", "tool_input": {"command": "grep -nE '"'"'branches:|- main|flyctl deploy|fly deploy'"'"' \"$f\" "}}'
proev 'awk med -F pipe'                  TAVS    '{"tool_name": "Bash", "tool_input": {"command": "awk -F'"'"'|'"'"' '"'"'{print $2}'"'"' fil"}}'
proev 'jq med pipe i filteret'           TAVS    '{"tool_name": "Bash", "tool_input": {"command": "jq '"'"'.[]|.x'"'"' data.json"}}'

if [ "$blokeret" -lt 5 ]; then
  echo "  FAIL SCOPE: kun $blokeret fik et raad — vagten ser ingenting"; fejl=$((fejl+1))
else
  echo "  ok   SCOPE: $blokeret kald fik faktisk et raad"
fi

if [ "$fejl" -eq 0 ]; then echo "deploy-guard: alle bestod"; exit 0
else echo "deploy-guard: $fejl fejlede"; exit 1; fi
