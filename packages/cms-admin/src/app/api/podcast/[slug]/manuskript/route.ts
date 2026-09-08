/**
 * F191.7 — GET henter manuskriptet som tekstfil, PUT lægger et rettet tilbage.
 *
 * Christian 8/9: «Lav Download og upload af manus … skal selvfølgeligt checkes
 * at et upload indeholder den rigtige syntaks.»
 *
 * Egen rute og ikke et felt på PATCH'en, fordi kroppen er en anden slags: her
 * kommer der RÅ TEKST fra en fil, ikke et JSON-objekt fra en skærm. At blande
 * de to ville betyde at den ene af dem skal gætte hvad den fik.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { hentAfsnit, skrivAfsnit } from "@/lib/podcast/store";
import { efterManuskriptRettelse } from "@/lib/podcast/state";
import { tilTekst, fraTekst } from "@/lib/podcast/tekstformat";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);

  const d = hentet.vaerdi.data;
  const tekst = tilTekst(d.replikker, { titel: d.titel, nummer: d.nummer, saeson: d.saeson });
  // text/plain og et filnavn: browseren skal GEMME den, ikke vise den. En fil
  // der åbner i fanen er en fil man skal kopiere ud af i hånden.
  return new Response(tekst, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-manuskript.txt"`,
      "cache-control": "no-store",
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.edit);
  if (afvist) return afvist.svar;

  const { slug } = await params;
  const hentet = await hentAfsnit(slug);
  if (!hentet.ok) return svar(req, { error: hentet.grund }, 409);
  if (!hentet.vaerdi) return svar(req, { error: `afsnittet «${slug}» findes ikke` }, 404);

  const raa = await req.text();

  // VALIDERES FØR NOGET SKRIVES. En fil der er halvt rigtig må ikke skrive en
  // halv samtale: halvt skrevet er værre end ikke skrevet, fordi det ser ud
  // som om der er noget, og det opdages først når nogen læser højt for penge.
  const laest = fraTekst(raa);
  if (!laest.ok) {
    return svar(req, { error: laest.grund, ...(laest.linje ? { linje: laest.linje } : {}) }, 400);
  }

  const skrevet = await skrivAfsnit(slug, {
    replikker: laest.replikker,
    // Som ved en manuel rettelse: godkendelsen trækkes tilbage. Man må ikke
    // godkende én tekst og indspille en anden.
    tilstand: efterManuskriptRettelse(hentet.vaerdi.data.tilstand),
  });
  if (!skrevet.ok) return svar(req, { error: skrevet.grund }, 409);
  return svar(req, { afsnit: skrevet.vaerdi, antal: laest.replikker.length });
}
