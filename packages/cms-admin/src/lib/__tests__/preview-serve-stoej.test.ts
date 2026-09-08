import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F193.2 — forhåndsvisningen må ikke larme på sider der ikke handler om den.
 *
 * Den sidste røde E2E-prøve efter sprog-rettelsen var ikke en fejl på
 * /agents eller /curation. Den var otte mislykkede kald til
 * `POST /api/preview-serve`, affyret af sidehovedet på HVER eneste
 * admin-side, mod et site der ikke er bygget:
 *
 *   Error: 404 på agents/curation:
 *   http://localhost:3011/api/preview-serve      (× 8)
 *
 * To ting gjorde den fejl usynlig indtil den blev navngivet:
 *
 *  1. **Sidehovedet startede en HTTP-server som en bivirkning af at rendere.**
 *     Ingen havde bedt om en forhåndsvisning. Knappen slår aldrig fra, og
 *     `openPreview` henter selv adressen ved klik — så det eager-kald købte
 *     ingenting ud over støjen.
 *  2. **«Ikke bygget endnu» svarede 404.** Den kode betyder «ruten findes
 *     ikke». I en browserkonsol, en fejlovervågning eller en røgprøve er de
 *     to tilstande derefter umulige at skelne — og det var præcis dét der
 *     kostede en CI-runde at opklare.
 *
 * Prøven her holder begge dele ude. Den læser kilden, fordi det er dét der
 * kan mutations-tjekkes: sæt kaldet tilbage i effekten, eller sæt 404
 * tilbage i ruten, og den går rød.
 */
const SRC = join(process.cwd(), "src");
const header = () => readFileSync(join(SRC, "components/admin-header.tsx"), "utf8");
const route = () => readFileSync(join(SRC, "app/api/preview-serve/route.ts"), "utf8");

/**
 * Kilden UDEN kommentarlinjer.
 *
 * Fanget af prøven selv på første kørsel: forklaringen ovenfor NÆVNER
 * `/api/preview-serve`, og tællingen ramte 2. Samme fælde som repoets
 * `ci-test-gate.test.ts` allerede beskriver — en vagt der ikke kan skelne en
 * kommentar fra en handling, tæller en forklaring som adfærd. At forklare en
 * fejl må ikke kunne forveksles med at begå den.
 */
const udenKommentarer = (src: string) =>
  src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

describe("forhåndsvisningen startes ved klik, ikke ved sidevisning", () => {
  it("sidehovedet kalder /api/preview-serve præcis ÉN gang — den ved klik", () => {
    const n = udenKommentarer(header()).split("/api/preview-serve").length - 1;
    expect(
      n,
      n > 1
        ? "sidehovedet kalder /api/preview-serve mere end ét sted — et af dem er " +
          "efter al sandsynlighed tilbage i en useEffect, og så affyres det på hver " +
          "eneste admin-side igen"
        : "sidehovedet kalder slet ikke /api/preview-serve længere — så åbner " +
          "Preview-knappen ingenting på et site uden previewSiteUrl",
    ).toBe(1);
  });

  it("POSITIV KONTROL: kaldet ligger stadig i openPreview", () => {
    // Uden denne ville «slet hele funktionen» bestå prøven ovenfor.
    const src = header();
    const i = src.indexOf("const openPreview");
    expect(i, "openPreview findes ikke længere").toBeGreaterThan(-1);
    expect(src.slice(i, i + 1800)).toContain("/api/preview-serve");
  });

  it("et klik der ikke kan starte forhåndsvisningen SIGER det", () => {
    // Husreglen: alt klikbart giver feedback. Da kaldet flyttede fra
    // sidevisning til klik, blev den tavse gren den almindelige gren.
    const src = header();
    const i = src.indexOf("const openPreview");
    expect(src.slice(i, i + 1800)).toMatch(/toast\.error/);
  });
});

describe("«ikke bygget endnu» er ikke det samme som «ruten findes ikke»", () => {
  it("preview-serve svarer ikke 404 når der ikke er noget dist/", () => {
    expect(
      route(),
      "et 404 her kan ikke skelnes fra en brudt rute — brug 409",
    ).not.toMatch(/status:\s*404/);
  });

  it("POSITIV KONTROL: den svarer 409, og den svarer stadig noget", () => {
    // Uden denne ville «slet hele fejlgrenen» bestå prøven ovenfor.
    const src = route();
    const i = src.indexOf("No dist/ directory found");
    expect(i, "fejlbeskeden om manglende build er væk").toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toMatch(/status:\s*409/);
  });
});
