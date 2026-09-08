/**
 * F191.2 — Aidans overgang til reklamen.
 *
 * Christian: «vi skal også have Aidan til at sige en standard besked, "Vi tager
 * lige en kort pause for at høre en besked fra dette afsnits sponsor"».
 *
 * HVORFOR GENBRUGT OG IKKE GENERERET HVER GANG. Sætningen er ~70 tegn, så
 * prisen er ikke argumentet ($0,007 pr. afsnit). Argumentet er at modellen ikke
 * er deterministisk: genereret på ny ved hver indspilning ville overgangen
 * skifte tonefald fra afsnit til afsnit. En overgang der lyder forskellig hver
 * gang er ikke en jingle — det er støj, og lytteren hører det som en fejl.
 *
 * Så den nøgles på (tekst + stemme) og laves én gang.
 *
 * TEKSTEN BOR I CMS'ET. Huset har en hard rule om netop det, og her er den
 * ikke formel: en kunde vil formulere sin egen overgang, og en reservetekst i
 * git kan kun ændres med en udrulning.
 */
import { createHash } from "node:crypto";

/** Reservetekst — en NØDBREMSE, ikke et hjem. Værdien skal stå i sitets
 *  globals; står den der ikke, renderer siden stadig, men teksten kan hverken
 *  søges eller rettes. Se husets regel om g("felt", "reserve"). */
export const OVERGANG_RESERVE =
  "Vi tager lige en kort pause for at høre en besked fra dette afsnits sponsor.";

/**
 * Overgangens identitet: teksten OG stemmen.
 *
 * Begge dele. Samme sætning læst af en anden stemme er en anden lyd, og en
 * nøgle der ikke kunne skelne dem ville genbruge den forkerte optagelse —
 * tavst, fordi filen findes og afspilleren virker. Samme begrundelse som
 * lydNoegle() i record.ts, og med vilje samme form.
 */
export function overgangNoegle(tekst: string, stemme: string): string {
  return createHash("sha256").update(`${tekst} ${stemme}`).digest("hex").slice(0, 16);
}

/**
 * Skal der overhovedet en overgang på?
 *
 * Kun når der ER et sponsorindslag. En overgang til ingenting — «vi tager en
 * kort pause» efterfulgt af næste replik — er værre end ingen overgang: den
 * lyder som en fil der mangler et stykke.
 */
export function skalHaveOvergang(sponsorSlug: string | undefined | null): boolean {
  return typeof sponsorSlug === "string" && sponsorSlug.trim().length > 0;
}
