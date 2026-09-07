/**
 * F189.5 — POST /api/podcast/[slug]/record · den ene handling der koster penge.
 *
 * Egen tilladelse (`podcast.record`), som redaktøren IKKE har. En der må rette
 * en tekst er ikke automatisk en der må bruge ejerens penge pr. tryk.
 *
 * Spærren på godkendelsen ligger i motoren, ikke her — så et kald udenom denne
 * rute rammer den samme regel.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { indspil } from "@/lib/podcast/record";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.record);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const krop = (await req.json().catch(() => ({}))) as {
    stemmer?: { aidan?: string; airina?: string };
  };
  const aidan = krop.stemmer?.aidan;
  const airina = krop.stemmer?.airina;
  if (!aidan || !airina) {
    return svar(req, { error: "begge stemmer skal angives: {stemmer:{aidan,airina}}" }, 400);
  }

  const resultat = await indspil({ afsnitSlug: slug, stemmer: { aidan, airina } });
  if (!resultat.ok) return svar(req, { error: resultat.grund }, 409);
  return svar(req, {
    afsnit: resultat.vaerdi.afsnit,
    lydUrl: resultat.vaerdi.lydUrl,
    prisUsd: resultat.vaerdi.prisUsd,
  });
}
