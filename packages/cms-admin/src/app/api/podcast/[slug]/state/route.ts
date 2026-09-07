/**
 * F189.5 — POST /api/podcast/[slug]/state · skift tilstand.
 *
 * Det er HER godkendelsen sker, og derfor er den et selvstændigt kald: et
 * menneske beder om den, den falder ikke ud af en anden handling.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { hentAfsnit, skrivAfsnit } from "@/lib/podcast/store";
import { erTilstand, maaSkifte } from "@/lib/podcast/state";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const krop = (await req.json().catch(() => ({}))) as { tilstand?: unknown };
  if (!erTilstand(krop.tilstand)) {
    return svar(req, { error: `«${String(krop.tilstand)}» er ikke en tilstand` }, 400);
  }

  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);

  const maa = maaSkifte(hentet.vaerdi.data.tilstand, krop.tilstand);
  if (!maa.ok) return svar(req, { error: maa.grund }, 409);

  const skrevet = await skrivAfsnit(slug, { tilstand: krop.tilstand });
  if (!skrevet.ok) return svar(req, { error: skrevet.grund }, 409);
  return svar(req, { afsnit: skrevet.vaerdi });
}
