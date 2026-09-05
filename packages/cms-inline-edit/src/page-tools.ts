/* F008.5 — side-værktøjer i redigerings-FAB'en (ejerens noter, 5/9-2026):
 * wrench-ikonet «Tools» på pillen; popup med KUN «★ Featured»-toggle; Tags
 * viser IKKE eksisterende tags — kun «+» og en mikro-form med komma-separerede
 * nye. Ren logik her (testbar uden DOM); DOM-limen bor i index.ts.
 */

/** Komma-separeret input → rene tags: trimmet, tomme ude, dubletter ude. */
export function parseTags(input: string): string[] {
  const set = new Set<string>();
  const ud: string[] = [];
  for (const raa of input.split(",")) {
    const t = raa.trim();
    if (!t) continue;
    const noegle = t.toLowerCase();
    if (set.has(noegle)) continue;
    set.add(noegle);
    ud.push(t);
  }
  return ud;
}

/** Nye tags lægges EFTER de eksisterende; dubletter (case-ufølsomt) springes
 *  over, og de eksisterendes stavning vinder. Ikke-array input = tom liste. */
export function mergeTags(eksisterende: unknown, nye: string[]): string[] {
  const basis = Array.isArray(eksisterende) ? eksisterende.filter((t): t is string => typeof t === "string") : [];
  const kendte = new Set(basis.map((t) => t.toLowerCase()));
  const ud = [...basis];
  for (const t of nye) {
    if (kendte.has(t.toLowerCase())) continue;
    kendte.add(t.toLowerCase());
    ud.push(t);
  }
  return ud;
}

/** Sidens PRIMÆRE dokument: den (collection, slug) der ejer flest felt-ankre —
 *  globals udelukkes (det er sitets chrome, ikke «denne side»). Ingen
 *  kandidater → null, og værktøjet holder sig slukket. */
export function primaryDocRef(
  ankre: Array<{ collection?: string; slug?: string }>,
): { collection: string; slug: string } | null {
  const taeller = new Map<string, { collection: string; slug: string; n: number }>();
  for (const a of ankre) {
    if (!a.collection || !a.slug || a.collection === "globals") continue;
    const noegle = `${a.collection} ${a.slug}`;
    const post = taeller.get(noegle) ?? { collection: a.collection, slug: a.slug, n: 0 };
    post.n++;
    taeller.set(noegle, post);
  }
  let bedst: { collection: string; slug: string; n: number } | null = null;
  for (const post of taeller.values()) {
    if (!bedst || post.n > bedst.n) bedst = post;
  }
  return bedst ? { collection: bedst.collection, slug: bedst.slug } : null;
}
