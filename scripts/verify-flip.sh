#!/usr/bin/env bash
# Post-flip verification for F169. Every line is a measurement, not an assumption.
D="$(dirname "$0")"
FAIL=0
ok()  { printf "  ✓ %s\n" "$1"; }
bad() { printf "  ✗ %s\n" "$1"; FAIL=1; }

echo "── 1 · Adressen, begge IP-familier hver for sig ──"
echo "   (zonen har aldrig haft IPv6 — en v6-fejl er usynlig fra en v4-maskine)"
for h in webhouse.dk www.webhouse.dk; do
  v4=$(dig -4 +short "$h" A @1.1.1.1 | tail -1)
  v6=$(dig +short "$h" AAAA @1.1.1.1 | tail -1)
  [ "$v4" = "66.241.125.55" ] && ok "$h A = $v4" || bad "$h A = ${v4:-tom} (ventet 66.241.125.55)"
  [ "$v6" = "2a09:8280:1::ed:6bd5:0" ] && ok "$h AAAA = $v6" || bad "$h AAAA = ${v6:-tom} (ventet 2a09:8280:1::ed:6bd5:0)"
done

echo "── 2 · Siden svarer, med gyldigt certifikat ──"
c=$(curl -s -o /dev/null -w "%{http_code}" https://www.webhouse.dk/)
[ "$c" = "200" ] && ok "https://www.webhouse.dk → 200" || bad "https://www.webhouse.dk → $c"
r=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://webhouse.dk/)
case "$r" in 301*www.webhouse.dk*) ok "https://webhouse.dk → $r";; *) bad "https://webhouse.dk → $r (ventet 301 til www)";; esac
curl -s -o /dev/null https://www.webhouse.dk/ && ok "certifikatet accepteres uden -k" || bad "certifikat-fejl"

echo "── 3 · Det er VORES site, ikke det gamle ──"
if curl -s https://www.webhouse.dk/ | grep -q 'data-cms-field'; then ok "siden bærer CMS-felter (det nye site)"; else bad "ingen CMS-felter — det gamle site svarer stadig"; fi

echo "── 4 · Sitemap peger på den rigtige adresse ──"
hosts=$(curl -s https://www.webhouse.dk/sitemap.xml | grep -o '<loc>https://[^/]*' | sed 's|<loc>https://||' | sort -u)
[ "$hosts" = "www.webhouse.dk" ] && ok "sitemap: kun www.webhouse.dk" || bad "sitemap nævner: $hosts"

echo "── 5 · MAILEN — den vigtigste ──"
after=$(dig +noall +answer webhouse.dk MX @ns1.ppi.dk | sed 's/\t[0-9]*\tIN/\tIN/' | sort)
before=$(grep -E "IN\tMX" "$D/verify-flip.zone-before.txt" | sort)
[ "$after" = "$before" ] && ok "MX byte-identisk med før flippet" || bad "MX HAR ÆNDRET SIG"
spf=$(dig +short webhouse.dk TXT @ns1.ppi.dk | grep spf1)
grep -qF "$spf" "$D/verify-flip.zone-before.txt" && ok "SPF uændret" || bad "SPF har ændret sig"
dm=$(dig +short _dmarc.webhouse.dk TXT @ns1.ppi.dk)
grep -qF "$dm" "$D/verify-flip.zone-before.txt" && ok "DMARC uændret" || bad "DMARC har ændret sig"
echo "   ⚠ en testmail skal stadig SENDES OG MODTAGES — dette beviser kun at opskriften står der"

echo "── 6 · De fem osm-navne peger stadig på den gamle maskine ──"
for n in osm osm1 osm2 osm3 osm4; do
  ip=$(dig +short "$n.webhouse.dk" A @ns1.ppi.dk | tail -1)
  [ "$ip" = "35.158.249.19" ] && ok "$n = $ip" || bad "$n = ${ip:-tom} (ventet 35.158.249.19)"
done

echo
[ "$FAIL" = "0" ] && echo "ALT GRØNT — mangler kun den rigtige testmail." || echo "NOGET FEJLEDE — se ✗ ovenfor. Tilbagerulning: A @ og A www → 35.158.249.19"
exit $FAIL
