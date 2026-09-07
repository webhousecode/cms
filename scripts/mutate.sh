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

# BASELINE FØRST. En mutations-prøve med RØD baseline måler harnessen, ikke
# koden: hver mutation rapporteres som «RØD med mutationen» uanset om den ramte
# noget. Målt 7/9-2026 på dette script — to mutationer meldte rødt for vagter de
# slet ikke berørte, fordi prøvefilen læste sin kilde via process.cwd() og
# fejlede før én assertion kørte under den kaldsform mutate.sh bruger. Jeg
# afleverede tallene til et kort OG til et andet repo, før jeg opdagede det.
#
# Samme familie som «filen skal ændre sig»-spærren nedenfor: begge nægter at
# aflevere et tal der ikke måler det man tror.
echo "── baseline (uden mutation) ──"
set +e
"$@" >/dev/null 2>&1
baseline=$?
set -e
if [ $baseline -ne 0 ]; then
  echo "✗ BASELINE ER RØD (exit $baseline) — prøven fejler UDEN mutationen." >&2
  echo "  Enhver mutation ville melde «RØD» herfra. Fix prøven først; kør så igen." >&2
  echo "  Kør kommandoen selv for at se hvorfor:  $*" >&2
  exit 4
fi
echo "✓ grøn uden mutationen — nu tæller en rød"

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

# INGEN NULL-BYTES. Bash's command substitution taber en backtick-streng som
# null-bytes ("ignored null byte in input"), og de er USYNLIGE: filen
# typetjekker, prøverne består, og en template-literal med et null-byte i
# stedet for et mellemrum hasher glad videre. Målt 7/9-2026 — jeg korrumperede
# record.ts med to af dem og opdagede det først da en søgning ikke kunne finde
# sin egen kode. En mutation må aldrig efterlade tegn ingen kan se.
#
# TJEKKET ER PYTHON, IKKE GREP, med vilje: `grep -q $'\x00'` afhænger af om den
# installerede grep læser \x00 som en hex-escape eller som fire tegn. Min første
# udgave gjorde netop det og fyrede kun ved et tilfælde af hvilken grep der stod
# i PATH. En spærre der virker på én maskine er ingen spærre.
#
# Gendan IKKE her — EXIT-trappen gør det. Kaldes den to gange, fejler den anden
# på en midlertidig fil der allerede er væk, og fejlbeskeden bliver om
# kopieringen i stedet for om null-bytesene.
if ! python3 -c "import sys; sys.exit(1 if open(sys.argv[1],'rb').read().count(b'\\x00') else 0)" "$fil"; then
  echo "✗ MUTATIONEN EFTERLOD NULL-BYTES i $fil — gendannet." >&2
  echo "  Skyldes typisk backticks sendt gennem skallen. Brug python eller en fil." >&2
  exit 5
fi

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
