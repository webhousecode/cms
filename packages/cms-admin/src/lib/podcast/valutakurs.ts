/**
 * F191.7 — USD → DKK, slået op i stedet for skrevet ind.
 *
 * Christian 8/9: «Slå kursen op dynamisk.» Konstanten var ærlig — den bar sin
 * egen måledato — og den ville have været forkert med måske ti procent om et år
 * uden at nogen opdagede det.
 *
 * FEJLER ÅBENT, og det er den bærende beslutning. En valutakurs er ikke værd at
 * tage en skærm ned for: kan opslaget ikke laves (netværket nede, tjenesten
 * væk, en 500), bruges den sidst kendte kurs, og svaret SIGER at den er en
 * reserve. En pris der ikke kan vises er værre end en pris der er to procent
 * forkert.
 *
 * ÉT OPSLAG, IKKE ÉT PR. VISNING. Kursen bevæger sig ikke inden for en
 * arbejdsdag på en måde der ændrer et beløb på halvanden krone.
 */

/** Sidst kendte kurs, brugt når opslaget ikke kan laves.
 *
 *  MÅLT 8. september 2026 kl. 02.02 (dansk tid) hos open.er-api.com: 6,4313.
 *  Den står her som en NØDBREMSE, ikke som sandheden — modsat før, hvor den
 *  VAR sandheden. Bliver den forældet, siger svaret det. */
export const RESERVE_KURS = 6.43;
export const RESERVE_MAALT = "2026-09-08";

const KILDE = "https://open.er-api.com/v6/latest/USD";
/** Seks timer. Kort nok til at følge en kurs, langt nok til at et opslag ikke
 *  ligger på hver eneste sidevisning. */
const LEVETID_MS = 6 * 60 * 60 * 1000;

export type Kurs = {
  kurs: number;
  /** Hvor tallet kom fra. En kurs uden herkomst kan ikke kontrolleres. */
  kilde: "opslag" | "reserve";
  /** Hvornår kursen blev fastsat — tjenestens eget tidsstempel, ikke vores gæt.
   *  En ren datostempel (YYYY-MM-DD, dansk kalenderdag); skærmen formaterer den
   *  i admin-sproget. */
  maalt: string;
};

let cache: { kurs: Kurs; hentet: number } | null = null;

/** Kun til prøverne: glem hvad der er hentet. */
export function nulstilKurs(): void {
  cache = null;
}

/** Kalenderdagen i dansk tid som YYYY-MM-DD — containeren kører UTC, og en
 *  dato uden zone læses i læserens egen. Se husets tidsregel. Værdien caches på
 *  modulet og deles af alle forespørgsler, så den er et sprogneutralt stempel;
 *  skærmen formaterer den i admin-sproget. */
function danskDato(d: Date): string {
  // i18n-ignore: machine date stamp (YYYY-MM-DD), formatted for the reader on the page
  const dele = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Copenhagen",
  }).formatToParts(d);
  const del = (type: string) => dele.find((x) => x.type === type)?.value ?? "";
  return `${del("year")}-${del("month")}-${del("day")}`;
}

/**
 * Hent kursen.
 *
 * `hent` kan overskrives i prøver, så et FEJLENDE opslag kan afprøves uden at
 * tage netværket ned. Det er den halvdel der betyder noget: at reserven virker
 * kan ikke bevises ved at opslaget lykkes.
 */
export async function hentKurs(hent: typeof fetch = fetch): Promise<Kurs> {
  if (cache && Date.now() - cache.hentet < LEVETID_MS) return cache.kurs;

  const reserve: Kurs = { kurs: RESERVE_KURS, kilde: "reserve", maalt: RESERVE_MAALT };
  try {
    const res = await hent(KILDE, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return reserve;
    const data = (await res.json()) as { rates?: Record<string, unknown>; time_last_update_utc?: unknown };
    const raa = data.rates?.DKK;
    // En kurs skal være et TAL og et fornuftigt et. USD/DKK har ligget mellem
    // 5 og 8 i årtier; et svar uden for det er ikke en kurs, det er en fejl
    // der er kommet igennem som JSON.
    if (typeof raa !== "number" || !Number.isFinite(raa) || raa < 3 || raa > 12) return reserve;

    const stempel = typeof data.time_last_update_utc === "string" ? new Date(data.time_last_update_utc) : null;
    const kurs: Kurs = {
      kurs: Math.round(raa * 100) / 100,
      kilde: "opslag",
      maalt: stempel && !Number.isNaN(stempel.getTime()) ? danskDato(stempel) : danskDato(new Date()),
    };
    cache = { kurs, hentet: Date.now() };
    return kurs;
  } catch {
    // Reserven caches IKKE. Ellers ville et enkelt netværksglip låse os til den
    // gamle kurs i seks timer.
    return reserve;
  }
}
