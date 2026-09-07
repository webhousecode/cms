/** F189.5 — POST /api/podcast/[slug]/generate · skriv manuskriptet fra en artikel. */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { genererManuskript } from "@/lib/podcast/generate";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const krop = (await req.json().catch(() => ({}))) as { samling?: string; artikel?: string };
  if (!krop.artikel) return svar(req, { error: "«artikel» (slug) mangler" }, 400);

  const resultat = await genererManuskript({
    afsnitSlug: slug,
    artikelSamling: krop.samling ?? "posts",
    artikelSlug: krop.artikel,
  });
  if (!resultat.ok) return svar(req, { error: resultat.grund }, 409);
  return svar(req, { afsnit: resultat.vaerdi.afsnit, replikker: resultat.vaerdi.replikker });
}
