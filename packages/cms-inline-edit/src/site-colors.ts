/**
 * F157.19 — sitets EGNE farver, læst fra dets CSS-variabler.
 *
 * Christian, 8/9-2026: paletten skal have «nogle standard farver man ofte
 * bruger, eks. helt hvid og de farver der er present i websitets css, altså
 * primær farverne».
 *
 * De LÆSES, de hardkodes ikke. Pakken installeres på flere sites med hver sin
 * palet; en fast liste ville være forkert på alle undtagen ét.
 */

/** Farver enhver redaktør rækker efter. Står ALTID i paletten — også når et
 *  site ikke har brugbare variabler, så paletten aldrig er tom. */
export const STANDARD_FARVER: { vaerdi: string; navn: string }[] = [
  { vaerdi: "#ffffff", navn: "Hvid" },
  { vaerdi: "#000000", navn: "Sort" },
  { vaerdi: "#374151", navn: "Mørkegrå" },
  { vaerdi: "#6b7280", navn: "Grå" },
  { vaerdi: "#d1d5db", navn: "Lysegrå" },
];

/** Ser værdien ud som en farve? Hex, rgb(), hsl() — og ikke andet.
 *  Bevidst snæver: en variabel der hedder --primary-spacing skal IKKE med. */
export function erFarve(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  return (
    /^#[0-9a-f]{3,8}$/i.test(s) ||
    /^rgba?\(\s*[\d.]+[\s,]/i.test(s) ||
    /^hsla?\(\s*[\d.]+/i.test(s)
  );
}

/**
 * Navnene på de custom properties sitet erklærer på :root / html.
 *
 * Kun NAVNENE hentes herfra. Værdierne læses bagefter med getComputedStyle, så
 * en variabel der peger på en anden (`--brand: var(--clay)`) resolveres af
 * browseren i stedet for af os.
 *
 * `.cssRules` KASTER på et cross-origin ark — et Google Fonts-link er nok. Uden
 * try/catch ville ét fremmed ark koste hele paletten, og fejlen ville se ud som
 * «sitet har ingen farver».
 */
export function variabelNavne(ark: readonly CSSStyleSheet[]): string[] {
  const navne: string[] = [];
  for (const s of ark) {
    let regler: CSSRuleList | undefined;
    try {
      regler = s.cssRules;
    } catch {
      continue; // cross-origin — ikke vores at læse
    }
    for (const r of Array.from(regler ?? [])) {
      const st = (r as CSSStyleRule).selectorText;
      const style = (r as CSSStyleRule).style;
      if (!st || !style) continue;
      if (!/(^|,)\s*(:root|html)\b/.test(st)) continue;
      for (let i = 0; i < style.length; i++) {
        const n = style[i];
        if (n && n.startsWith("--") && !navne.includes(n)) navne.push(n);
      }
    }
  }
  return navne;
}

/** Et pænt navn til svatchen: «--brand-primary» → «brand primary». */
export function pentNavn(variabel: string): string {
  return variabel.replace(/^--/, "").replace(/[-_]+/g, " ").trim();
}

/**
 * Sitets farver, klar til paletten. Højst `maks` styk — en palet med fyrre
 * felter er ikke en palet, den er en liste.
 */
export function siteFarver(
  ark: readonly CSSStyleSheet[],
  laes: (navn: string) => string,
  maks = 10,
): { vaerdi: string; navn: string }[] {
  const ud: { vaerdi: string; navn: string }[] = [];
  const set = new Set(STANDARD_FARVER.map((f) => f.vaerdi.toLowerCase()));
  for (const n of variabelNavne(ark)) {
    const v = laes(n).trim();
    if (!erFarve(v)) continue;
    const key = v.toLowerCase();
    if (set.has(key)) continue; // ikke den samme farve to gange i paletten
    set.add(key);
    ud.push({ vaerdi: v, navn: pentNavn(n) });
    if (ud.length >= maks) break;
  }
  return ud;
}
