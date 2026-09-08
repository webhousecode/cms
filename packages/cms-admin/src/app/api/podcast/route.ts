/**
 * F189.5 — GET /api/podcast · listen over afsnit.
 *
 * Hver handling i motoren har et endpoint. Ingen af dem findes KUN i cms-admins
 * UI — det er hele ejerens note: et site skal kunne bygge sit eget panel.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { listAfsnit, opretAfsnit } from "@/lib/podcast/store";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const liste = await listAfsnit();
  if (!liste.ok) return svar(req, { error: liste.grund }, 409);

  // SORTERET, og rækkefølgen er en del af svaret — ikke noget hver klient skal
  // finde på selv. Højeste nummer først («nyeste øverst»), og de unummererede
  // til sidst frem for forrest: et afsnit uden nummer er en kladde, ikke det
  // nyeste. Uden -1 ville `undefined` sortere vilkårligt.
  const sorteret = [...liste.vaerdi].sort(
    (a, b) =>
      (b.data.saeson ?? -1) - (a.data.saeson ?? -1) ||
      (b.data.nummer ?? -1) - (a.data.nummer ?? -1),
  );
  return svar(req, { afsnit: sorteret });
}

/**
 * POST /api/podcast — opret et afsnit UDEN en artikel.
 *
 * Ejerens krav 8/9-2026: man skal kunne skrive et manuskript manuelt og selv
 * bestemme hvor i sæsonen det ligger. Indtil nu var generering fra en artikel
 * den eneste vej ind, så en fast intro ikke kunne laves gennem API'et.
 *
 * `podcast.edit` og ikke `podcast.read`: det er en skrivning. Den koster ingen
 * penge — det gør kun indspilningen — så den deler tilladelse med de øvrige
 * manuskript-handlinger.
 */
export async function POST(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const krop = (await req.json().catch(() => ({}))) as {
    slug?: unknown;
    titel?: unknown;
    nummer?: unknown;
    saeson?: unknown;
  };

  const slug = typeof krop.slug === "string" ? krop.slug.trim() : "";
  // Slug'en bliver et filnavn og en URL. Afvis alt andet end det der kan bære
  // begge dele, frem for at rense den i stilhed — en slug der ikke blev til
  // det man skrev, er sværere at finde igen end en der blev afvist.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return svar(
      req,
      { error: "«slug» skal være små bogstaver, tal og bindestreger — fx «afsnit-01»" },
      400,
    );
  }

  /** Begge tal valideres ens. `0` er et GYLDIGT nummer, så den oplagte
   *  `Number(x) || undefined` ville tavst kaste det væk — samme fælde som
   *  kundenummeret hos fd-sundhed. Derfor eksplicit på undefined/null/"". */
  const heltal = (v: unknown, navn: string): number | undefined | { fejl: string } => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      return { fejl: `«${navn}» skal være et helt tal på 0 eller derover` };
    }
    return n;
  };

  const nummer = heltal(krop.nummer, "nummer");
  if (typeof nummer === "object") return svar(req, { error: nummer.fejl }, 400);
  const saeson = heltal(krop.saeson, "saeson");
  if (typeof saeson === "object") return svar(req, { error: saeson.fejl }, 400);

  const oprettet = await opretAfsnit(slug, {
    ...(typeof krop.titel === "string" ? { titel: krop.titel.trim() } : {}),
    ...(nummer !== undefined ? { nummer } : {}),
    ...(saeson !== undefined ? { saeson } : {}),
  });
  if (!oprettet.ok) return svar(req, { error: oprettet.grund }, 409);
  return svar(req, { afsnit: oprettet.vaerdi }, 201);
}
