/**
 * F191.4 — PUT /api/podcast/[slug]/sponsor · vælg indslag og placering.
 *
 * Sin EGEN rute og ikke et felt på manuskript-PATCH'en, fordi de to har
 * forskellig konsekvens: en rettelse i manuskriptet trækker godkendelsen
 * tilbage (man må ikke godkende én tekst og indspille en anden), mens et skift
 * af sponsor ikke rører en eneste replik. Lagde vi dem sammen, ville et
 * sponsorvalg af-godkende et manuskript ingen havde rørt.
 *
 * PLACERINGEN ER EN PLADS I MANUSKRIPTET, ikke et klokkeslæt. Redaktøren læser
 * replikker; et sekundtal ville skulle regnes om hver gang en replik ændres.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { hentAfsnit, skrivAfsnit } from "@/lib/podcast/store";
import { hentSponsor, maaBruges } from "@/lib/podcast/sponsors";

export const OPTIONS = preflight;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);

  const krop = (await req.json().catch(() => null)) as {
    sponsorSlug?: unknown;
    efterReplik?: unknown;
  } | null;

  // null/tom = FJERN sponsoren. En egen betydning, ikke en fejl: et afsnit skal
  // kunne få reklamen taget af igen uden at man sletter indslaget fra arkivet.
  const raaSlug = typeof krop?.sponsorSlug === "string" ? krop.sponsorSlug.trim() : "";
  if (!raaSlug) {
    const ryddet = await skrivAfsnit(slug, { sponsorSlug: "", sponsorEfterReplik: undefined });
    if (!ryddet.ok) return svar(req, { error: ryddet.grund }, 409);
    return svar(req, { afsnit: ryddet.vaerdi, sponsor: null });
  }

  const fundet = await hentSponsor(raaSlug);
  if (!fundet.ok) return svar(req, { error: fundet.grund }, 409);
  if (!fundet.vaerdi) return svar(req, { error: `indslaget «${raaSlug}» findes ikke` }, 404);

  // SAMME spærre som ved indspilningen. Et indslag uden lyd ville give en
  // sammenføjning der mangler et stykke: værten siger «vi tager en kort pause»
  // og derefter kommer der ingenting. Fanget her, hvor redaktøren står — ikke
  // først når pengene er brugt.
  const kanBruges = maaBruges(fundet.vaerdi.data);
  if (!kanBruges.ok) return svar(req, { error: `indslaget kan ikke bruges: ${kanBruges.grund}` }, 409);

  const antal = hentet.vaerdi.data.replikker.length;
  let efter: number | undefined;
  if (krop?.efterReplik !== undefined && krop.efterReplik !== null) {
    if (typeof krop.efterReplik !== "number" || !Number.isInteger(krop.efterReplik)) {
      return svar(req, { error: "«efterReplik» skal være et helt tal" }, 400);
    }
    // Uden for manuskriptet AFVISES her, frem for at blive rykket i stilhed.
    // Indspilningen rykker den (et afsnit der ikke kan indspilles er værre end
    // en reklame et andet sted), men dét er en nødbremse — når et menneske
    // vælger, skal det have at vide at valget ikke gav mening.
    if (krop.efterReplik < 0 || krop.efterReplik >= antal) {
      return svar(
        req,
        { error: `«efterReplik» skal være mellem 0 og ${antal - 1} — afsnittet har ${antal} replikker` },
        400,
      );
    }
    efter = krop.efterReplik;
  }

  const skrevet = await skrivAfsnit(slug, {
    sponsorSlug: raaSlug,
    ...(efter !== undefined ? { sponsorEfterReplik: efter } : {}),
  });
  if (!skrevet.ok) return svar(req, { error: skrevet.grund }, 409);
  return svar(req, { afsnit: skrevet.vaerdi, sponsor: { slug: raaSlug, titel: fundet.vaerdi.data.titel } });
}
