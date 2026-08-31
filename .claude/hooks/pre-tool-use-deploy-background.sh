#!/usr/bin/env bash
# F08.9/F08.10 — PreToolUse deploy-vagt (BLOKERENDE: exit 2).
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
# DEN BLOKERER — og det er efter ejerens udtrykkelige valg. Christian, 31/8,
# efter at jeg havde bygget den om til et uforpligtende raad: «din spaerre er
# god nok saalaenge agenten ved hvad den SAA skal goere — den maa godt blokkes,
# men jobbet maa jo ikke gaa i staa.»
#
# DET ER HELE KONTRAKTEN: arbejdet stopper ikke, det FLYTTER. Blokeringen er
# kun forsvarlig fordi beskeden navngiver den praecise rettelse, og fordi den
# rettelse tager eet felt. En spaerre uden en vej videre ville vaere en
# arbejdsstandsning; det her er en omdirigering.
#
# FEJLER AABENT. Kan hooken ikke afgoere noget — ingen jq, uparsbart input,
# manglende felt — TILLADER den kaldet. En vagt der spaerrer ved egen tvivl
# bliver slaaet fra, og saa er den vaerre end ingen vagt.
#
# FALSKE POSITIVER ER DERFOR DYRE, og tre blev meldt paa under to timer
# (ai-sdk, components, Christian i cms): et grep EFTER moensteret blev stoppet.
# De er lukket i F08.10 — enkelt-citerede strenge er data, ikke kommandoer.
#
# Input (stdin JSON fra cc): { tool_name, tool_input: { command?, run_in_background? } }
# Output ved traef: begrundelsen paa stderr + exit 2 (cc's blokerings-kontrakt).

# F287.3 — ejeren kan slaa denne port fra i cardmem uden at genstarte flaaden.
# Tjekkes FOERST, foer noget parses: en port nogen har slukket fordi den goer
# ondt, skal ikke koste noget overhovedet. rule_disabled fejler LUKKET (porten
# koerer) ved enhver tvivl — se _common.sh.
_D="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
# shellcheck source=/dev/null
[ -r "$_D" ] && . "$_D"
if command -v rule_disabled >/dev/null 2>&1 && rule_disabled "deploy-background"; then exit 0; fi

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

# NAEVNELSE ER IKKE KOERSEL (F08.10). Meldt uafhaengigt af ai-sdk, components og
# Christian paa under to timer: en kommando der leder EFTER moensteret —
# `grep -qE '"'"'…xcodebuild…'"'"'`, en sed i en doc, en test AF spaerren selv — blev
# blokeret, fordi vaerktoejsnavnet stod inde i en soegestreng.
#
# Indholdet af ENKELT-citerede strenge er DATA og stripes derfor.
# Dobbelt-citerede beholdes BEVIDST: `bash -c "flyctl deploy"` ER en koersel, og
# at strippe dem ville aabne et hul i stedet for at lukke et.
# CITERET TEKST ER DATA (F08.10). cms' repro, maalt mod F08.9-udgaven:
#
#   grep -oE 'aaa|flyctl deploy|bbb' fil.txt   -> BLOKERET
#
# Splitteren deler paa | uden at respektere citering, saa moensteret rives itu
# og fragmentet «flyctl deploy» staar bart paa sin egen linje og rammer ankeret.
# Deres diagnose var praecis, OG de rettede deres eget foerste gaet: ordet SIDST
# i moensteret slipper igennem (`xcodebuild' fil.txt` — apostroffen staar lige
# efter ordet), saa kun ordet MIDT i en alternation udloeser den. Det gjorde
# fejlen sporadisk at opleve og svaer at jage.
#
# Meldt af TRE uafhaengige sessioner paa under to timer: ai-sdk, components, cms
# — og Christian saa den selv. Rammer grep, sed, awk, rg, python -c: enhver
# kommando der BAERER et moenster. cms advarede eksplicit mod at hviddliste
# `grep`, og de har ret: formen er ikke bundet til vaerktoejet.
#
# RAEKKEFOELGEN ER DET HELE, og min foerste rettelse havde den forkert. Jeg
# strippede kun ENKELT-citater for at bevare `bash -c "flyctl deploy"` — som ER
# en koersel. Resultatet var at den dobbelt-citerede variant af cms' repro
# stadig blokerede. Nyttelasten skal LOEFTES UD foerst, DEREFTER strippes begge
# slags citater. Saa er begge sande paa een gang.
# `bash -c "…"` og `eval "…"` KOERER deres streng — den er et program, ikke
# data. Den loeftes ud FOER citat-strippen, saa begge er sande paa een gang.
skal=$(printf '%s' "$head" \
  | sed -nE -e 's/.*[[:space:]]-c[[:space:]]+"([^"]*)".*/\1/p' \
            -e "s/.*[[:space:]]-c[[:space:]]+'([^']*)'.*/\1/p" \
            -e 's/.*(^|[^[:alnum:]_])eval[[:space:]]+"([^"]*)".*/\2/p' \
            -e "s/.*(^|[^[:alnum:]_])eval[[:space:]]+'([^']*)'.*/\2/p" \
            -e "s/.*(^|[^[:alnum:]_])ssh([[:space:]]+[^[:space:]]+)*[[:space:]]+'([^']*)'.*/\3/p" \
            -e 's/.*(^|[^[:alnum:]_])ssh([[:space:]]+[^[:space:]]+)*[[:space:]]+"([^"]*)".*/\3/p')
ren=$(printf '%s' "$head" | sed -E "s/'[^']*'/''/g; s/\"[^\"]*\"/\"\"/g")
[ -n "$skal" ] && ren=$(printf '%s\n%s' "$ren" "$skal")

# INDESLUTNING, IKKE PRAEFIKS (F08.10). components' maaling afgjorde designet:
# de proevede otte former og viste at det er EET hul, ikke otte.
#
#   OUT=$(flyctl deploy)                        slap igennem
#   OUT=`flyctl deploy`                         slap igennem
#   if true; then flyctl deploy; fi             slap igennem
#   for a in a b; do flyctl deploy -a $a; done  slap igennem
#   echo a | xargs -I{} flyctl deploy -a {}     slap igennem
#   eval "flyctl deploy --remote-only"          slap igennem
#   bash -c "flyctl deploy --remote-only"       slap igennem
#
# ROOT CAUSE, deres saetning: vagten kiggede kun paa OEVERSTE NIVEAU af en flad
# kommandolinje. UDRULNING var ankret med ^, saa alt der NESTER udrulningen —
# en substitution, en betingelse, en loekke, eval, bash -c, xargs — flytter den
# vaek fra starten af et led, og saa fandtes den ikke.
# `if true; then flyctl deploy; fi` er den der overbeviser: den SPLITTER paa ;
# saa `then flyctl deploy` ER et led — men leddet begynder med `then`.
#
# OG DE FRARAADEDE UDTRYKKELIGT AT TILFOEJE `then|do|eval|xargs` TIL ANKERET:
# det ville lukke de otte former de kom i tanke om, ikke KLASSEN. Naeste gang er
# det `nohup … &`, `time flyctl deploy`, `sudo -E`, en shell-funktion. Samme kur
# som at taelle kaldesteder — den fejlform vi tre har set fejle to dage i traek.
#
# SAA: findes vaerktoejsnavnet NOGEN STEDER i kommandoen, blokeres den. Det er
# kun forsvarligt fordi de to kilder til falsk positiv allerede er fjernet
# ovenfor — heredoc-kroppe og citeret tekst er ude af $ren. Hvad der er tilbage
# er kommando, ikke data.
ORD='fly(ctl)?[[:space:]]+deploy|gh[[:space:]]+run[[:space:]]+watch|docker[[:space:]]+(build|push)|(npm|pnpm)[[:space:]]+publish|xcodebuild|(eas|expo)[[:space:]]+build|vercel[[:space:]]+(deploy|--prod)|terraform[[:space:]]+apply'

# LAESE-VARIANTER. Efter omlaegningen til indeslutning behoeves kun de flag der
# goer selve udrulnings-kommandoen til et opslag — `fly status` og `gh run list`
# INDEHOLDER ikke et udrulningsord og slipper af sig selv.
LAES='(^|[[:space:]])(--help|-h|--dry-run)([[:space:]]|$)'

# KOMMANDO-POSITION. Ren indeslutning var for stump — maalt paa fire former
# components ikke naaede at naevne, og den sidste er den dyre:
#
#   echo flyctl deploy                 blokeret  (bar naevnelse)
#   git log --grep=flyctl deploy       blokeret
#   rg -n flyctl deploy src/           blokeret
#   ls docs | grep xcodebuild          blokeret  <- en helt almindelig soegning
#
# components sagde det selv: «en falsk positiv paa en git add er vaerre end en
# falsk negativ paa en eval, fordi den foerste rammer hver dag.» Det holder.
#
# SAA: ordet skal staa hvor en KOMMANDO kan staa. Det er stadig ikke en liste
# over indpakninger — det er shellens egen, LUKKEDE grammatik for hvor en
# kommando begynder: linjestart, en separator, eller et af de faa noegleord der
# indleder en. `then|do|eval|nohup|time` staar her ikke som otte lapper paa otte
# former, men fordi bash definerer dem som kommando-position. Det er forskellen
# paa at opregne en aaben klasse og at bruge en lukket.
FORAN='(^|[;&|(){}`]|(^|[[:space:]])(then|do|else|elif|eval|exec|nohup|time|sudo|env|command|nice|stdbuf)[[:space:]]+|(^|[[:space:]])(timeout|nice)[[:space:]]+-?[0-9]+[smhd]?[[:space:]]+|(^|[[:space:]])[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)[[:space:]]*([A-Za-z0-9_.~-]*/)*'

hvad=""
if ! printf '%s' "$ren" | grep -qiE "$LAES"; then
  hvad=$(printf '%s' "$ren" | grep -oiE "${FORAN}(${ORD})" | grep -oiE "$ORD" | head -1)
fi

if [ -z "$hvad" ]; then
  # VENTEPOSITION SOM EGENSKAB (F08.10).
  #
  # Christian saa en session staa stille 7 min 10 sek paa:
  #   for i in $(seq 1 14); do s=$(gh run list …); case … *) sleep 45;; esac; done
  #
  # Vagten blokerede den ikke: `gh run list` er ISOLERET et opslag. I en loekke
  # med sleep er den ikke et opslag — den er en VENTEPOSITION. Listen ovenfor
  # fanger VAERKTOEJET; det der koster tid er VENTETIDEN, og ingen kan opregne
  # alle maader at vente paa. Derfor en EGENSKAB ved siden af listen.
  #
  # MAALT paa 120.687 Bash-kald fra 330 transskripter:
  #   vente-loekke FORGRUND  2.176 kald  39,5 t   <- ikke fanget
  #   vente-loekke BAGGRUND    672        0,1 t   <- saadan skal det se ud
  # Deploy-klassen i F08.9 var 38,6 t. Den ubehandlede halvdel var stoerre.
  #
  # ⚠ BEGGE TAL ER FORLOEBEN MASKINTID og maa IKKE citeres som tabt tid.
  # Christian: «Det er MIG der spilder min tid med at vente — en LLM er
  # ligeglad.» I HANS enhed er hele huset 21,9 timer, ikke 78: kun ~22 % af
  # kaldene laa i et tidsrum hvor han faktisk skrev til sessionen. Taerslen
  # nedenfor overlever, men fordi den andel er KONSTANT paa tvaers af klasser —
  # ikke fordi sekunderne i sig selv var prisen.
  #
  # TAERSKLEN ER MAALT FREM, ikke gaettet:
  #   sleep >=15                   360 kald  14,8 t
  #   uendelig (while true/until)  486       14,0 t
  #   sleep 5-14                   485        5,8 t
  #   sleep 1-4                    845        4,9 t  <- 39 % af kald, 12 % af tid
  # Korte retry-loekker gaar FRI: at spaerre dem ville irritere konstant og
  # spare naesten intet. De tre andre former er 1.331 kald og 34,6 timer.
  if printf '%s' "$ren" | grep -qE '(^|[^[:alnum:]_])(while|until|for)([^[:alnum:]_])' \
     && printf '%s' "$ren" | grep -qE '(^|[^[:alnum:]_])do([^[:alnum:]_]|$)' \
     && printf '%s' "$ren" | grep -qE '(^|[^[:alnum:]_])sleep[[:space:]]+[0-9]'; then
    laengst=$(printf '%s' "$ren" | grep -oE 'sleep[[:space:]]+[0-9]+' | grep -oE '[0-9]+$' | sort -rn | head -1)
    ubetinget=no
    printf '%s' "$ren" | grep -qE 'while[[:space:]]+(true|:)|(^|[^[:alnum:]_])until([^[:alnum:]_])' && ubetinget=ja
    if [ "$ubetinget" = "ja" ] || [ "${laengst:-0}" -ge 5 ]; then
      hvad="en vente-loekke (sleep ${laengst:-?}s i en loekke)"
    fi
  fi
fi

[ -n "$hvad" ] || exit 0

{
  printf 'F08.9/F08.10: koer «%s» i BAGGRUNDEN — saa gaar arbejdet videre.\n\n' "$hvad"
  printf 'DETTE STOPPER IKKE JOBBET. Det flytter det. Koer PRAECIS samme\n'
  printf 'kommando igen med eet felt tilfoejet:\n\n'
  printf '    run_in_background: true\n\n'
  printf 'Saa koerer den videre paa tvaers af ture, sessionen bliver ved med at\n'
  printf 'svare mens den arbejder, og du vaekkes naar den er faerdig — MED\n'
  printf 'exit-koden, saa du stadig kan bevise at det lykkedes. Laes undervejs\n'
  printf 'med Read paa den output-fil kaldet returnerer.\n\n'
  printf 'Det er IKKE en subagent: ingen ny rude, ingen ny indlogning, samme\n'
  printf 'session og samme konto.\n\n'
  printf 'HVORFOR: i forgrunden staar sessionen tavs — ejeren kan ikke tale med\n'
  printf 'dig mens den koerer, og en fly-deploy tager op mod 20 minutter.\n\n'
  printf 'MAALT i den rigtige enhed — HANS ventetid, ikke forloeben maskintid.\n'
  printf 'En udrulning kl. 03 hvor ingen sidder der koster nul. Kald der laa i\n'
  printf 'et tidsrum hvor han faktisk skrev til sessionen: 1.224 stk, 21,9 timer\n'
  printf '(udrulninger 13,6 t · vente-loekker 7,3 t).\n\n'
  printf 'Skal den UNDTAGELSESVIS koere i forgrunden, saa sig det til ejeren\n'
  printf 'foerst — spaerren er bevidst uden en tavs bagdoer.\n'
} >&2
exit 2
