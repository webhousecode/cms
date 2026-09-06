#!/usr/bin/env bash
# Mutations-tjek der BEVISER at mutationen blev anvendt.
#
#   scripts/mutate.sh <fil> <find> <erstat> -- <testkommando...>
#
# En mutation der ikke rammer noget er ikke en negativ kontrol — den er den
# samme måling to gange, og to ens tal ligner et resultat. Målt 6/9-2026:
# jeg byttede `beskytTagGraenser(html)` → `html` med en sed, fik samme output
# som før, og konkluderede over for ejeren at rettelsen ikke gjorde nogen
# forskel. Filen var gendannet inden proben kørte. Rettelsen var ægte og
# reparerede en fejl i drift; min måling sagde det modsatte.
#
# Trail-sessionen fandt samme hul i deres eget værktøj samme aften, i den
# ANDEN retning: en mutation der ikke rammer bliver GRØN, læses som «prøven
# fanger det ikke», og så skærpes en prøve der allerede virkede. Lige så tavs.
#
# Derfor: filen SKAL ændre sig, ellers stopper vi frem for at aflevere et tal.
set -euo pipefail

fil="${1:?fil}"; find_s="${2:?find}"
# ${3?...} og IKKE ${3:?...}: en TOM erstatning er en gyldig mutation (slet
# linjen), og med kolon afviste scriptet netop den. Fanget 6/9 da jeg forsøgte
# at fjerne en vagt-linje og fik «3: erstat» i stedet for en måling.
erstat="${3?erstat}"; shift 3
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "mangler testkommando efter --" >&2; exit 2; }

[ -f "$fil" ] || { echo "findes ikke: $fil" >&2; exit 2; }
sikkerhed="$(mktemp)"; cp "$fil" "$sikkerhed"
foer="$(shasum -a 256 "$fil" | cut -d' ' -f1)"
gendan() { cp "$sikkerhed" "$fil"; rm -f "$sikkerhed"; }
trap gendan EXIT

FIND="$find_s" ERSTAT="$erstat" python3 - "$fil" <<'PY'
import os, sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
find, erstat = os.environ["FIND"], os.environ["ERSTAT"]
n = s.count(find)
if n == 0:
    sys.exit(f"MUTATION RAMTE INTET: {find!r} findes ikke i {p}")
open(p, "w", encoding="utf-8").write(s.replace(find, erstat))
print(f"muteret {n} sted(er)")
PY

efter="$(shasum -a 256 "$fil" | cut -d' ' -f1)"
[ "$foer" != "$efter" ] || { echo "FILEN ER UÆNDRET trods erstatning — mutationen tæller ikke" >&2; exit 3; }
printf 'sha %s → %s\n' "${foer:0:8}" "${efter:0:8}"

# KØR KOMMANDOEN RÅT. Den første udgave af dette script lod kalderen pipe
# testen gennem `grep` for at forkorte outputtet — og så var det GREPs exit-kode
# der blev læst. En rød testkørsel blev meldt som «GRØN med mutationen»: præcis
# den fejlform scriptet findes for, i scriptet selv. Pipe aldrig testen; vil du
# have kortere output, så filtrér EFTER dette script, ikke inde i det.
set +e
"$@"
kode=$?
set -e
echo
if [ $kode -eq 0 ]; then
  echo "✗ GRØN MED MUTATIONEN — prøven fanger ikke det den skulle bevise"
  exit 1
fi
echo "✓ RØD med mutationen (exit $kode) — prøven er et instrument"
