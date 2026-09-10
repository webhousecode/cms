/**
 * F194 — dansk tid ét sted.
 *
 * Containeren på Fly kører UTC (målt 10/9-2026: `date` og `date -u` giver
 * samme svar, TZ er tom). Alt der læser `d.getHours()` eller `d.getDate()` på
 * serveren læser derfor UTC — og præsenterer det som om det var dansk.
 *
 * Vinduet er 22.00–24.00 dansk sommertid: en begivenhed 2026-09-09T22:30:00Z
 * er den 10. september kl. 00.30 i Danmark, og blev vist på den 9.
 *
 * ZONE-NAVNET, ALDRIG ET OFFSET. Danmark er UTC+1 om vinteren og UTC+2 om
 * sommeren, så «læg to timer til» er forkert et halvt år ad gangen — en fejl
 * med et halvt års lunte som ingen kobler til sin årsag.
 *
 * LAGRING OG SAMMENLIGNING BLIVER VED MED AT VÆRE UTC. Det er kun
 * PRÆSENTATIONEN der får en zone. Rækkefølge og datoregning er kun korrekte på
 * et absolut tidspunkt.
 */
export const DK_ZONE = "Europe/Copenhagen";

/** Et ØJEBLIK, aldrig et gæt.
 *
 *  F194 — en dato-tid-streng UDEN zone («2026-07-01T12:00:00») tolkes af
 *  `new Date` i MASKINENS zone. Samme streng er derfor to forskellige
 *  øjeblikke på min Mac og i CI, og det opdagede CI før jeg gjorde: min egen
 *  prøve bestod lokalt fordi Macen tilfældigvis kører dansk tid.
 *
 *  Det er præcis den fejlklasse denne fil findes for at lukke, så den gætter
 *  ikke — den siger fra. En kalder der har et vægur skal selv sige hvilken
 *  zone det er i. */
function tilOejeblik(naar: Date | string): Date {
  if (naar instanceof Date) {
    if (Number.isNaN(naar.getTime())) throw new Error("dansk-tid: ugyldig Date");
    return naar;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(naar) && !/(Z|[+-]\d{2}:?\d{2})$/.test(naar)) {
    throw new Error(
      `dansk-tid: «${naar}» har ingen tidszone. En dato-tid uden zone er et gæt — ` +
        "send et rigtigt øjeblik (…Z eller ±HH:MM), eller en Date.",
    );
  }
  const d = new Date(naar);
  if (Number.isNaN(d.getTime())) throw new Error(`dansk-tid: ugyldigt tidspunkt ${String(naar)}`);
  return d;
}

/** Felterne i dansk tid for et øjeblik. `sv-SE` fordi det ISO-formaterer. */
function dkDele(naar: Date | string): { dag: string; time: string; minut: string; sekund: string } {
  const d = tilOejeblik(naar);
  const dag = new Intl.DateTimeFormat("sv-SE", { timeZone: DK_ZONE }).format(d); // YYYY-MM-DD
  const [time, minut, sekund] = new Intl.DateTimeFormat("sv-SE", {
    timeZone: DK_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .split(":");
  return { dag, time: time ?? "00", minut: minut ?? "00", sekund: sekund ?? "00" };
}

/** Den DANSKE kalenderdag, `YYYY-MM-DD`. Det er nøglen en dag grupperes på. */
export function dkDag(naar: Date | string): string {
  return dkDele(naar).dag;
}

/** Dansk vægur som `YYYY-MM-DDTHH:MM:SS` — uden zone, fordi den ER dansk.
 *  Brug den til visning, aldrig til at gemme eller sammenligne. */
export function dkVaegur(naar: Date | string): string {
  const { dag, time, minut, sekund } = dkDele(naar);
  return `${dag}T${time}:${minut}:${sekund}`;
}

/** ICS-tid i UTC: `YYYYMMDDTHHMMSSZ`.
 *
 *  UTC og ikke flydende tid. En flydende tid (uden Z) læses af modtagerens
 *  kalender-app som DENS lokale tid — så en dansk udgivelse kl. 00.30 landede
 *  kl. 00.30 hos en modtager i enhver anden zone. Med Z konverterer app'en
 *  selv, hvilket også er det rigtige for en modtager uden for Danmark. */
export function icsUtc(naar: Date | string, plusMinutter = 0): string {
  const d = new Date(tilOejeblik(naar).getTime());
  if (plusMinutter) d.setUTCMinutes(d.getUTCMinutes() + plusMinutter);
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** Dansk klokkeslæt til visning, `HH:MM`. */
export function dkKlokke(naar: Date | string): string {
  const { time, minut } = dkDele(naar);
  return `${time}:${minut}`;
}

/** Ugedagen i DANSK tid. 0 = søndag, 1 = mandag … 6 = lørdag.
 *
 *  Udledt af den danske KALENDERDAG, ikke af et råt `getDay()`. Forskellen er
 *  ikke teoretisk: et ugentligt job sat til mandag ville med serverens ur køre
 *  på UTC-mandag, og i vinduet 23-24 dansk tid er de to forskellige dage. */
export function dkUgedag(naar: Date | string): number {
  const [y, m, d] = dkDag(naar).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** Dansk time og minut som tal, til at placere en begivenhed i en ugekolonne.
 *
 *  ÉN kilde til begge tal. Ugevisningen læste før timen herfra og minuttet råt
 *  fra tidsstemplets tegn 14-16 — to mekanismer for det samme tidspunkt, i to
 *  nabolinjer.
 *
 *  De gav det SAMME svar, og det er pointen: de var enige udelukkende fordi
 *  Danmark er et helt antal timer fra UTC. Det var altså ikke en fejl, men en
 *  rigtighed der hvilede på en uskreven egenskab ved vores zone — og som en
 *  zone med halvtime-forskydning bryder stille. */
export function dkUrMinut(naar: Date | string): [number, number] {
  const { time, minut } = dkDele(naar);
  return [Number(time), Number(minut)];
}
