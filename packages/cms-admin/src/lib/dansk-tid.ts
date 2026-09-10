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

/** Felterne i dansk tid for et øjeblik. `sv-SE` fordi det ISO-formaterer. */
function dkDele(naar: Date | string): { dag: string; time: string; minut: string; sekund: string } {
  const d = naar instanceof Date ? naar : new Date(naar);
  if (Number.isNaN(d.getTime())) throw new Error(`dansk-tid: ugyldigt tidspunkt ${String(naar)}`);
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
  const d = naar instanceof Date ? new Date(naar.getTime()) : new Date(naar);
  if (Number.isNaN(d.getTime())) throw new Error(`dansk-tid: ugyldigt tidspunkt ${String(naar)}`);
  if (plusMinutter) d.setUTCMinutes(d.getUTCMinutes() + plusMinutter);
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}
