/**
 * F189.4 — indspilningen. Den ene handling i CMS'et der koster rigtige penge
 * hver gang den bruges (~$1,48 pr. afsnit).
 *
 * TRE TING GØR DEN ANDERLEDES END RESTEN AF MOTOREN:
 *
 * 1. Den er SPÆRRET server-side på godkendelsen. Et flueben i en browser er en
 *    høflighed; spærren skal ligge hvor pengene bruges.
 * 2. Lyden NØGLES på (manuskript + stemmer). En rettelse giver en NY fil frem
 *    for at overskrive en der stadig bruges — lyden hører til ÉT manuskript, og
 *    manuskriptet er også underteksterne.
 * 3. En fejl undervejs efterlader afsnittet i sin FORRIGE tilstand. «Indspillet»
 *    med en manglende fil er værre end «godkendt»: det ser færdigt ud.
 */
import { createHash } from "node:crypto";
import { getAI } from "@/lib/ai/client";
import { getMediaAdapter } from "@/lib/media";
import { maaIndspilles } from "./state";
import { estimat } from "./preflight";
import { hentAfsnit, skrivAfsnit, type Afsnit, type StoreSvar } from "./store";
import type { Replik } from "./manuscript";

/**
 * Lydens identitet: manuskriptet OG stemmerne.
 *
 * Begge dele, ikke kun manuskriptet. Samme tekst læst af andre stemmer er en
 * anden lydfil, og en nøgle der ikke kunne skelne dem ville genbruge den
 * forkerte optagelse — tavst, fordi filen findes og afspilleren virker.
 */
export function lydNoegle(replikker: Replik[], stemmer: { aidan: string; airina: string }): string {
  const h = createHash("sha256");
  for (const r of replikker) h.update(`${r.speaker} ${r.text} `);
  h.update(`voices:${stemmer.aidan}/${stemmer.airina}`);
  return h.digest("hex").slice(0, 16);
}

export type IndspilSvar = StoreSvar<{
  afsnit: Afsnit;
  lydUrl: string;
  noegle: string;
  prisUsd: number;
}>;

export async function indspil(args: {
  afsnitSlug: string;
  stemmer: { aidan: string; airina: string };
}): Promise<IndspilSvar> {
  const hentet = await hentAfsnit(args.afsnitSlug);
  if (!hentet.ok) return hentet;
  const afsnit = hentet.vaerdi;
  if (!afsnit) return { ok: false, grund: `afsnittet «${args.afsnitSlug}» findes ikke` };

  // SPÆRREN. Server-side, før noget koster noget. maaIndspilles() er den ene
  // regel der står mellem dette kald og rigtige penge — den bor ét sted netop
  // så dette ikke bliver et `=== "godkendt"` nogen kan glemme.
  const maa = maaIndspilles(afsnit.data.tilstand);
  if (!maa.ok) return { ok: false, grund: maa.grund };

  if (!afsnit.data.replikker.length) {
    return { ok: false, grund: "manuskriptet er tomt" };
  }

  const noegle = lydNoegle(afsnit.data.replikker, args.stemmer);

  // Samme manuskript + samme stemmer = samme fil. Ingen grund til at betale
  // igen for noget vi allerede har.
  if (afsnit.data.lydNoegle === noegle && afsnit.data.lydUrl) {
    return {
      ok: true,
      vaerdi: {
        afsnit,
        lydUrl: afsnit.data.lydUrl,
        noegle,
        prisUsd: afsnit.data.faktiskPrisUsd ?? 0,
      },
    };
  }

  // Studiet. Her bruges pengene.
  let lyd: Uint8Array;
  let mimeType: string;
  try {
    const ai = await getAI();
    const resultat = await ai.podcast({
      script: afsnit.data.replikker.map((r) => ({ speaker: r.speaker, text: r.text })),
      voices: { aidan: args.stemmer.aidan, airina: args.stemmer.airina },
      purpose: "podcast.episode",
    });
    lyd = resultat.audio;
    mimeType = resultat.mimeType;
  } catch (err) {
    // AFSNITTET RØRES IKKE. Det står stadig som «godkendt», hvilket er sandt:
    // manuskriptet er godkendt, der er bare ingen lyd. Havde vi sat
    // «indspillet» først og skrevet filen bagefter, ville en fejl her have
    // efterladt et afsnit der ser færdigt ud og ikke kan afspilles.
    return {
      ok: false,
      grund: `indspilningen fejlede: ${err instanceof Error ? err.message : "ukendt fejl"}`,
    };
  }

  // Filen. Navngivet med nøglen, så en rettelse giver en NY fil frem for at
  // overskrive en der stadig bruges af et udgivet afsnit.
  let lydUrl: string;
  try {
    const adapter = await getMediaAdapter();
    const filnavn = `podcast-${args.afsnitSlug}-${noegle}.mp3`;
    const resultat = await adapter.uploadFile(filnavn, Buffer.from(lyd), "podcast");
    lydUrl = adapter.type === "filesystem" ? `/uploads${resultat.url}` : resultat.url;
  } catch (err) {
    // Lyden ER lavet og betalt, men kunne ikke gemmes. Sig det præcist frem for
    // at melde en generisk fejl — pengene er brugt, og det skal den der læser
    // beskeden vide.
    return {
      ok: false,
      grund:
        `lyden blev lavet (og betalt) men kunne ikke gemmes: ` +
        `${err instanceof Error ? err.message : "ukendt fejl"}. Prøv igen — det koster igen.`,
    };
  }

  const pris = estimat(afsnit.data.replikker).prisUsd;
  const skrevet = await skrivAfsnit(args.afsnitSlug, {
    tilstand: "indspillet",
    lydUrl,
    lydNoegle: noegle,
    stemmer: args.stemmer,
    faktiskPrisUsd: pris,
  });
  if (!skrevet.ok) return skrevet;

  return { ok: true, vaerdi: { afsnit: skrevet.vaerdi, lydUrl, noegle, prisUsd: pris } };
}
