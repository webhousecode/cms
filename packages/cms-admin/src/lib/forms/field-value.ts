/**
 * A submitted value, as a PERSON should read it.
 *
 * Fundet ved at måle to rigtige indsendelser på broberg.ai, ikke ved at læse
 * koden: feltet «Nyhedsbrev» er et flueben, og notifikationen skrev
 *
 *     Nyhedsbrev: true
 *
 * Det er maskinens ord vist til et menneske — samme fejlform som da denne
 * skabelon viste feltets NØGLE ("newsletter") frem for dens etiket ("Nyhedsbrev").
 * Den blev rettet dengang; det her er den samme fejl ét lag længere inde, i
 * VÆRDIEN frem for i etiketten.
 *
 * TYPEN AFGØR, IKKE VÆRDIEN. `String(v)` er rigtigt for de fleste felter og
 * forkert for præcis to — og hvilke to kan kun feltets erklærede type sige.
 * En gætte-regel på indholdet ("ligner det true/false?") ville have gjort en
 * fritekst hvor nogen skrev «true» til et Ja.
 */

/** Hvad et flueben og en dato hedder for en læser. */
const ORD = {
  da: { ja: "Ja", nej: "Nej" },
  en: { ja: "Yes", nej: "No" },
} as const;

export type ValueLang = keyof typeof ORD;

/**
 * @param type feltets ERKLÆREDE type fra formularens skema, ikke gættet
 */
export function formatFieldValue(value: unknown, type: string | undefined, lang: ValueLang): string {
  const raw = String(value ?? "");

  if (type === "checkbox") {
    // Et flueben når hertil som "true"/"false" (formularen sender strenge) eller
    // som en ægte boolean. Begge former, fordi kun den ene er målt og den anden
    // er en HTTP-detalje der kan ændre sig.
    const sandt = value === true || raw === "true" || raw === "on" || raw === "1";
    const falsk = value === false || raw === "false" || raw === "off" || raw === "0" || raw === "";
    if (sandt) return ORD[lang].ja;
    if (falsk) return ORD[lang].nej;
    return raw; // Noget uventet: vis det frem for at kalde det Nej.
  }

  if (type === "date") {
    // En dato lander som "2026-09-04". Notifikationen skriver allerede sit eget
    // tidsstempel som "4. september 2026"; at lade feltet stå i maskinform ved
    // siden af ville være to formater i samme brev.
    const d = new Date(raw);
    if (raw && !Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      try {
        return new Intl.DateTimeFormat(lang === "da" ? "da-DK" : "en-GB", {
          dateStyle: "long",
          timeZone: "Europe/Copenhagen",
        }).format(d);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  return raw;
}
