/**
 * F189.5 — vagten der betaler for at podcast-API'et står i proxy'ens
 * PUBLIC_PREFIXES.
 *
 * Proxy'en tjekker ikke længere en cookie for disse ruter, fordi et site med
 * sit eget login skal kunne kalde dem med et Bearer-token. Det flytter hele
 * grænsen ind i handlerne — og en grænse der ligger seks steder er seks steder
 * nogen kan glemme den. Den der bliver glemt er den der bliver brugt.
 *
 * Derfor LÆSER denne prøve rutefilerne. Den tjekker ikke at koden er skrevet
 * rigtigt i dag; den fejler den dag nogen tilføjer en syvende rute uden tjek.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isPodcastApi } from "@/proxy";

// src/lib/__tests__ → ../../.. er pakkeroden. («../..» giver src/ — målt, og
// det fejlede før nogen assertion overhovedet kørte.)
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PODCAST_DIR = join(PKG_ROOT, "src/app/api/podcast");
const PROXY = readFileSync(join(PKG_ROOT, "src/proxy.ts"), "utf8");

function ruteFiler(dir: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(dir)) {
    const sti = join(dir, navn);
    if (statSync(sti).isDirectory()) ud.push(...ruteFiler(sti));
    else if (navn === "route.ts") ud.push(sti);
  }
  return ud;
}

/** Hver eksporteret HTTP-handler i filen, med sin krop. */
function handlere(kilde: string): { navn: string; krop: string }[] {
  const dele = kilde.split(/export async function /g).slice(1);
  return dele.map((d) => ({
    navn: (d.match(/^([A-Z]+)/)?.[1] ?? "?"),
    krop: d,
  }));
}

describe("F189.5 — podcast-API'ets egen auth-grænse", () => {
  const filer = ruteFiler(PODCAST_DIR);

  it("finder rutefilerne (ellers måler resten ingenting)", () => {
    // Uden denne ville en tom liste få hele suiten til at bestå grønt på nul
    // ruter — den slags grønne svar på et smallere spørgsmål er præcis det
    // denne fil findes for.
    expect(filer.length).toBeGreaterThanOrEqual(6);
  });

  for (const fil of filer) {
    const kort = relative(PKG_ROOT, fil);
    const kilde = readFileSync(fil, "utf8");

    for (const h of handlere(kilde)) {
      if (h.navn === "OPTIONS") continue; // preflight svarer 204 uden data

      it(`${kort} · ${h.navn} går gennem kraevTilladelse`, () => {
        expect(h.krop).toContain("kraevTilladelse");
      });

      it(`${kort} · ${h.navn} returnerer afvisningen (tjekket må ikke kun kaldes)`, () => {
        // Et `await kraevTilladelse(...)` hvis svar ikke returneres, er værre
        // end intet tjek: det ser ud som om grænsen er der.
        expect(h.krop).toMatch(/if \(\w+\) return \w+\.svar;/);
      });
    }
  }
});

describe("isPodcastApi — matcheren proxy'en åbner på", () => {
  it("rammer listeruten uden skråstreg", () => {
    expect(isPodcastApi("/api/podcast")).toBe(true);
  });

  it("rammer ruterne under den", () => {
    expect(isPodcastApi("/api/podcast/mit-afsnit")).toBe(true);
    expect(isPodcastApi("/api/podcast/mit-afsnit/record")).toBe(true);
  });

  it("rammer IKKE en sti der blot begynder med samme bogstaver", () => {
    // «/api/podcast» som streng i PUBLIC_PREFIXES ville have åbnet denne.
    expect(isPodcastApi("/api/podcastfoo")).toBe(false);
    expect(isPodcastApi("/api/podcasts")).toBe(false);
  });

  it("rammer ikke andre API'er", () => {
    expect(isPodcastApi("/api/cms/posts/x")).toBe(false);
    expect(isPodcastApi("/api/admin/site-config")).toBe(false);
  });
});

describe("auth for podcast ligger i PROXY'en — ikke i handleren", () => {
  /**
   * REGRESSIONEN DENNE VAGT FINDES FOR, målt i produktion 8/9-2026.
   *
   * Første udgave gjorde /api/podcast til en PUBLIC PREFIX, så ruterne kunne
   * autentificere sig selv. Det virkede for et bruger-JWT — og brød `wh_`-
   * adgangstokens, fordi det tidlige public-prefix-retur ligger FØR proxy'ens
   * wh_-gren. Samme token gav 200 på /api/cms/posts og 401 på /api/podcast, så
   * et maskinkald fra et anvender-sites server var låst ude af netop det API
   * det skulle bruge.
   *
   * To døre til samme flade driver fra hinanden. Vagten holder dem til én.
   */
  it("podcast står IKKE i PUBLIC_PREFIXES", () => {
    const liste = PROXY.slice(PROXY.indexOf("const PUBLIC_PREFIXES = ["));
    const krop = liste.slice(0, liste.indexOf("];"));
    expect(krop).not.toContain("/api/podcast");
  });

  it("public-prefix-gaten kalder ikke isPodcastApi", () => {
    expect(PROXY).not.toMatch(/isPublicPrefix[\s\S]{0,120}isPodcastApi/);
  });

  it("podcast-grenen ligger EFTER wh_-grenen, så maskinkald stadig konverteres", () => {
    const wh = PROXY.indexOf('bearerToken.startsWith("wh_")');
    const pod = PROXY.indexOf("isPodcastApi(pathname) && payload.sub");
    expect(wh, "wh_-grenen findes ikke").toBeGreaterThan(-1);
    expect(pod, "podcast-grenen findes ikke").toBeGreaterThan(-1);
    expect(pod).toBeGreaterThan(wh);
  });

  it("proxy'en videresender kun IDENTITETEN — den afgør ikke hvad man må", () => {
    // Grenen sætter en cookie og forwarder. Tilladelsen afgøres af
    // kraevTilladelse i hver rute; ellers ville proxy'en åbne for noget.
    // Et fast vindue, ikke `indexOf("}")`: første `}` efter branchens start
    // ligger inde i `${existingCookies}`, så et naivt udsnit klipper FØR den
    // linje der skal måles — og prøven ville melde en mangel der ikke findes.
    const krop = PROXY.slice(
      PROXY.indexOf("isPodcastApi(pathname) && payload.sub"),
      PROXY.indexOf("isPodcastApi(pathname) && payload.sub") + 400,
    );
    expect(krop).toContain("COOKIE_NAME");
    expect(krop).not.toMatch(/podcast\.(read|edit|record)/);
  });
});
