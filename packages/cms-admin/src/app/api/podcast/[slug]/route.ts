/**
 * F189.5 — ét afsnit: læs (GET) og ret manuskriptet (PATCH).
 *
 * PATCH er den vej et menneske retter en replik. Rettelsen trækker
 * godkendelsen tilbage af sig selv — ellers kunne man godkende én tekst og
 * indspille en anden.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { hentAfsnit, skrivAfsnit } from "@/lib/podcast/store";
import { efterManuskriptRettelse } from "@/lib/podcast/state";
import { parseManuskript } from "@/lib/podcast/manuscript";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);
  return svar(req, { afsnit: hentet.vaerdi });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const krop = (await req.json().catch(() => null)) as { replikker?: unknown } | null;
  if (!krop || !Array.isArray(krop.replikker)) {
    return svar(req, { error: "kroppen skal have en liste «replikker»" }, 400);
  }

  // SAMME validering som på et genereret manuskript. Et menneske kan også skrive
  // en tom replik eller slette den ene vært; reglen «en samtale har to stemmer»
  // gælder uanset hvem der skrev teksten.
  const parset = parseManuskript(JSON.stringify(krop.replikker));
  if (!parset.ok) return svar(req, { error: `manuskriptet blev afvist: ${parset.grund}` }, 400);

  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);

  const skrevet = await skrivAfsnit(slug, {
    replikker: parset.replikker,
    // En rettelse trækker godkendelsen tilbage. Automatisk, ikke som noget
    // kalderen skal huske — det er dét der gør reglen til en spærre.
    tilstand: efterManuskriptRettelse(hentet.vaerdi.data.tilstand),
  });
  if (!skrevet.ok) return svar(req, { error: skrevet.grund }, 409);
  return svar(req, { afsnit: skrevet.vaerdi });
}
