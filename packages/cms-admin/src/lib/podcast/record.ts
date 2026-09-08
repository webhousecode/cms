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
import { hentSponsor, maaBruges } from "./sponsors";
import { overgangNoegle, skalHaveOvergang, OVERGANG_RESERVE } from "./bumper";
import { sitetsUdtaler, SPONSOR_MODEL } from "./udtale";
import { sySammen } from "./stitch";
import type { Replik } from "./manuscript";

/**
 * Lydens identitet: manuskriptet OG stemmerne.
 *
 * Begge dele, ikke kun manuskriptet. Samme tekst læst af andre stemmer er en
 * anden lydfil, og en nøgle der ikke kunne skelne dem ville genbruge den
 * forkerte optagelse — tavst, fordi filen findes og afspilleren virker.
 */
export function lydNoegle(
  replikker: Replik[],
  stemmer: { aidan: string; airina: string },
  sponsor?: { slug?: string; efterReplik?: number },
): string {
  const h = createHash("sha256");
  for (const r of replikker) h.update(`${r.speaker} ${r.text} `);
  h.update(`voices:${stemmer.aidan}/${stemmer.airina}`);
  // F191 — SPONSOREN ER EN DEL AF LYDENS IDENTITET. Uden den ville et afsnit
  // der lige har fået en reklame på genbruge den gamle fil UDEN reklamen: samme
  // manuskript, samme stemmer, samme nøgle. Filen findes, afspilleren virker,
  // og sponsoren er der bare ikke — den tavse slags fejl, og her koster den en
  // kunde penge han har betalt for at få leveret.
  if (sponsor?.slug) h.update(`sponsor:${sponsor.slug}@${sponsor.efterReplik ?? 0}`);
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
  /** Sitets egen formulering af overgangen til reklamen. Kommer fra CMS'et;
   *  udelades den, bruges nødbremsen i bumper.ts. */
  overgangTekst?: string;
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

  const noegle = lydNoegle(afsnit.data.replikker, args.stemmer, {
    slug: afsnit.data.sponsorSlug,
    efterReplik: afsnit.data.sponsorEfterReplik,
  });

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
    const alle = afsnit.data.replikker.map((r) => ({ speaker: r.speaker, text: r.text }));

    // F191 — UDEN SPONSOR: én optagelse, som før. Den korte vej er den samme
    // som den altid har været, så et afsnit uden reklame ikke betaler for
    // kompleksitet det ikke bruger.
    if (!skalHaveOvergang(afsnit.data.sponsorSlug)) {
      const resultat = await ai.podcast({
        script: alle,
        voices: { aidan: args.stemmer.aidan, airina: args.stemmer.airina },
        purpose: "podcast.episode",
      });
      lyd = resultat.audio;
      mimeType = resultat.mimeType;
    } else {
      const syet = await indspilMedSponsor({
        afsnit,
        stemmer: args.stemmer,
        overgangTekst: args.overgangTekst ?? OVERGANG_RESERVE,
      });
      if (!syet.ok) return syet;
      lyd = syet.vaerdi.mp3;
      mimeType = "audio/mpeg";
    }
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
    // ADAPTERENS URL BRUGES UÆNDRET. Den første udgave satte «/uploads» foran
    // for filesystem-adapteren — men den returnerer ALLEREDE «/uploads/...»,
    // så resultatet blev «/uploads/uploads/...», som svarer 404.
    //
    // Målt 7/9 i F189.7's første rigtige indspilning: alt så grønt ud —
    // HTTP 200, tilstand «indspillet», en 5,5 minutters mp3 på disken, prisen
    // gemt — og den ene værdi en lytter skal bruge, pegede på ingenting.
    // Præcis den slags fejl enhedsprøverne ikke kan se, fordi de ikke spørger
    // om filen kan hentes.
    lydUrl = resultat.url;
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

/**
 * F191 — indspilning MED et sponsorindslag.
 *
 * Afsnittet optages i TO dele, fordi reklamen skal ligge et bestemt sted:
 *
 *   [replik 0 … n]  ·  Aidans overgang  ·  reklamen  ·  [replik n+1 …]
 *
 * To ai.podcast()-kald frem for ét. Det koster IKKE mere — det er de samme
 * tegn — men det er den eneste måde at få et snit på et sted vi selv vælger.
 * Alternativet ville være at klippe i den færdige lyd, og dér findes grænsen
 * mellem to replikker ikke som noget man kan finde.
 *
 * OVERGANGEN GENBRUGES. Den nøgles på (tekst + stemme) og gemmes som fil, så
 * den lyder ens i hvert afsnit. Se bumper.ts for hvorfor det ikke er en
 * optimering men en kvalitet.
 */
async function indspilMedSponsor(args: {
  afsnit: Afsnit;
  stemmer: { aidan: string; airina: string };
  overgangTekst: string;
}): Promise<StoreSvar<{ mp3: Uint8Array }>> {
  const { afsnit, stemmer, overgangTekst } = args;
  const slug = afsnit.data.sponsorSlug!;

  const hentet = await hentSponsor(slug);
  if (!hentet.ok) return hentet;
  if (!hentet.vaerdi) return { ok: false, grund: `sponsorindslaget «${slug}» findes ikke` };
  const maa = maaBruges(hentet.vaerdi.data);
  if (!maa.ok) return maa;

  const adapter = await getMediaAdapter();

  // Reklamens bytes. Den ligger i mediebiblioteket, så den læses DERFRA og
  // ikke over HTTP — et internt kald til vores egen offentlige adresse ville
  // kræve at serveren kan nå sig selv, hvilket den ikke altid kan.
  const url = hentet.vaerdi.data.lydUrl!;
  const dele = url.replace(/^\/+/, "").split("/").filter(Boolean);
  const uden = dele[0] === "uploads" ? dele.slice(1) : dele;
  const reklame = await adapter.readFile(uden);
  if (!reklame) {
    return {
      ok: false,
      grund: `sponsorindslagets lydfil kunne ikke læses (${url}). Indslaget peger på en fil der ikke er der.`,
    };
  }

  const ai = await getAI();
  const alle = afsnit.data.replikker.map((r) => ({ speaker: r.speaker, text: r.text }));

  // Snittet. Ligger det uden for manuskriptet, lægges reklamen til sidst frem
  // for at fejle: et afsnit der ikke kan indspilles er værre end en reklame der
  // ligger et andet sted end redaktøren troede — og listen kan være blevet
  // kortere siden placeringen blev valgt.
  const raa = afsnit.data.sponsorEfterReplik ?? Math.floor(alle.length / 2);
  const snit = Math.max(1, Math.min(raa + 1, alle.length));
  const foer = alle.slice(0, snit);
  const efter = alle.slice(snit);

  const del1 = await ai.podcast({
    script: foer,
    voices: { aidan: stemmer.aidan, airina: stemmer.airina },
    purpose: "podcast.episode",
  });

  // Overgangen. voiceFallback sættes IKKE med vilje: SDK'ets egen dokumentation
  // advarer mod det netop hvor stemmen er en identitet et menneske genkender.
  // Aidan ER den identitet her. Hellere en fejl med en besked end at afsnittet
  // pludselig får en fremmed stemme uden at nogen får det at vide.
  // F191.6 — SAMME ordbog som reklamen. Aidan siger sponsorens navn i sin egen
  // indledning, så en ordbog der kun nåede reklamen ville give to udtaler af
  // samme navn med fem sekunders mellemrum.
  const udtaler = await sitetsUdtaler();
  const overgang = await ai.tts({
    text: overgangTekst,
    voice: stemmer.aidan,
    purpose: "podcast.sponsor-overgang",
    // SAMME model som replikkerne omkring den — ellers skifter Aidans stemme
    // karakter i den ene sætning hvor han holder pause.
    override: { ...SPONSOR_MODEL },
    ...(udtaler ? { pronunciations: udtaler } : {}),
  });

  const stykker: Uint8Array[] = [del1.audio, overgang.audio, new Uint8Array(reklame)];
  if (efter.length) {
    const del2 = await ai.podcast({
      script: efter,
      voices: { aidan: stemmer.aidan, airina: stemmer.airina },
      purpose: "podcast.episode",
    });
    stykker.push(del2.audio);
  }

  const syet = await sySammen(stykker);
  if (!syet.ok) return { ok: false, grund: syet.grund };

  // Overgangens nøgle gemmes ikke som fil her — den er en del af den samlede
  // afsnitsfil. Nøglen findes for at kunne SVARE på om overgangen har ændret
  // sig, og den ligger derfor i afsnittets lydnøgle via sponsorSlug.
  void overgangNoegle(overgangTekst, stemmer.aidan);

  return { ok: true, vaerdi: { mp3: syet.mp3 } };
}
