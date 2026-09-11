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
  // Værdien ender i en style-streng (`background:${vaerdi}`). Et semikolon dér
  // ville lukke deklarationen og åbne den næste. En custom property kan i
  // praksis ikke bære et semikolon — men gætter man forkert på præcis dét,
  // fejler man i den retning hvor ingenting ser galt ud.
  if (s.length > 64 || s.includes(";") || s.includes("}")) return false;
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

/**
 * Testid-venligt navn til ÉN svatch: «Mørkegrå» → «morkegra».
 *
 * Fem svatcher der deler ét testid er fem knapper Lens kun kan trykke på den
 * første af — og en knap uden sit eget anker er ikke verificerbar (F086).
 */
export function testidNavn(navn: string): string {
  return navn
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * F197 — sitets ERKLÆREDE tekstfarver, som KLASSER.
 *
 * Christian 11/9-2026: brandfarven manglede i paletten. Årsagen var at
 * siteFarver() tager de ti første :root-variabler i deklarations-rækkefølge,
 * og på broberg.ai er --orange-text nummer 13 — bag fire skær og flader ingen
 * ville farve tekst med.
 *
 * MEN LOFTET VAR IKKE DEN EGENTLIGE FEJL. En fast hex kan ikke overleve et
 * temaskift: --orange-text er #ff6a45 i mørkt og #c93a16 i lyst tema, med
 * vilje, fordi den lyse skal kunne læses på hvid. Vælger en redaktør hex'en,
 * fryses den ene, og teksten bliver forkert i det andet tema. At rangordne
 * værdier bedre løser ikke at VÆRDIEN SELV er det forkerte at gemme.
 *
 * Derfor gemmes en KLASSE. components formulerede hvorfor det slår et
 * var(--token) i gemt indhold: et token-navn kan omdøbes, og så brækker hvert
 * dokument der brugte det — tavst, uden migrering og uden noget der siger
 * hvornår. En klasse er et navn SITET ejer; at holde den sand er sitets eget
 * arbejde.
 *
 *     :root {
 *       --cms-farve-o: var(--orange-text);   klassen .o
 *       --cms-farve-o-navn: "Brandfarve";    valgfri etiket
 *     }
 *
 * Værdien males KUN på svatchen — læst med getComputedStyle, så knappen viser
 * den rigtige farve i det tema redaktøren står i, mens indholdet aldrig
 * indeholder en værdi. Intet loft: en erklæret liste er en beslutning, ti
 * tilfældige er et gæt.
 */
export const KLASSE_PRAEFIKS = "--cms-farve-";

/** Må denne streng bruges som klassenavn i markup?
 *
 *  Snæver med vilje. Værdien kommer fra CSS og ender i class="…" — et mellemrum
 *  ville lave ÉN klasse om til to, og et citationstegn ville lukke attributten.
 *  Begge dele fejler i den retning hvor siden stadig ser rigtig ud. */
export function erKlassenavn(s: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(s);
}

export interface SiteKlasse {
  klasse: string;
  vaerdi: string;
  navn: string;
}

/**
 * Sitets erklærede tekstfarver. Rækkefølgen er sitets egen.
 *
 * `-navn`-varianten er en ETIKET, ikke en farve, og må ikke selv blive en
 * svatch — præfikset matcher den også.
 */
export function siteKlasser(
  ark: readonly CSSStyleSheet[],
  laes: (navn: string) => string,
): SiteKlasse[] {
  const ud: SiteKlasse[] = [];
  const set = new Set<string>();
  for (const n of variabelNavne(ark)) {
    if (!n.startsWith(KLASSE_PRAEFIKS)) continue;
    if (n.endsWith("-navn")) continue; // etiketten, ikke en farve
    const klasse = n.slice(KLASSE_PRAEFIKS.length);
    if (!erKlassenavn(klasse) || set.has(klasse)) continue;
    const vaerdi = laes(n).trim();
    if (!erFarve(vaerdi)) continue;
    set.add(klasse);
    // Etiketten kommer fra CSS og er derfor citeret: "Brandfarve" → Brandfarve.
    const raa = laes(`${n}-navn`).trim().replace(/^["']|["']$/g, "");
    ud.push({ klasse, vaerdi, navn: raa || pentNavn(`--${klasse}`) });
  }
  return ud;
}
