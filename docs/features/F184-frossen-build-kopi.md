# F184 — Sites bygges fra en frossen kopi af kundens `build.ts`

## Hvordan det kom frem

trail-sessionen efterprøvede en artikel-import 2. september og opdagede noget større: de havde pushet **to kode-ændringer** til `apps/landing/build.ts` samme dag — committet, pushet, bygget lokalt, verificeret i `dist/`, grøn CI. Ingen af dem live. Samtidig **var** deres indholds-ændringer live.

## Målt

```
registry, site trail
  configPath   /data/cms-admin/beam-sites/trail/cms.config.ts

vores volumen (ls, read-only)
  build.ts     63.139 bytes   3. maj 02:00

deres repo (broberg-ai/trail)
  build.ts     78.950 bytes   ændret 2. september

commits der har rørt filen siden 3. maj:  4
commits der er nået frem:                 0
```

`gh-pages`-historikken siger det samme fra den anden side — hver eneste commit derinde er `Deploy from webhouse.app`. **Sitet bygges udelukkende af os.**

## Konsekvensen er ude hos læserne

```
forsidens egen menu:  href="/pricing/"   (3 forekomster)
https://www.trailmem.com/pricing/   →  404
modkontrol, samme menu: /trails/    →  200
```

Prissiden blev bygget 27. maj (`482ce77`, `b0f4545`) og har **aldrig eksisteret live**. Forsiden har linket til den i tre måneder.

Mekanismen forklarer hvorfor det ser så mærkeligt ud: **menupunktet er INDHOLD** (CMS → deploy → live ✅), mens **siden det peger på er KODE** (`build.ts` → frosset ❌). To halvdele af samme feature tog hver sin vej, og kun den ene kom frem.

## Fejlformen

Ikke et blindt instrument, ikke et forkert trin, men **et helt arbejde der ser færdigt ud og aldrig når frem**. Det bygger lokalt. Det kan verificeres i `dist/`. Det passerer CI. Outputtet forlader aldrig maskinen. Intet fejler.

Det gør `apps/landing/build.ts` i kundens repo til **en fil der ser levende ud og er død**.

## Hvorfor det er vores

ICD-push'et beamer **indhold**, ikke projektfiler. `build.ts`, `package.json` og `public/` kom med ved den oprindelige beam 3. maj og er ikke rørt siden.

Samme hul som cms' egen **2026-05-02-hændelse**, hvor rocket-knappen fejlede med «No build.ts found» fordi kun indhold var beamet. Dengang løst ved at beame projektet **én gang**. Den *løbende* vej blev aldrig lukket, og fem måneder senere er resultatet en frossen kopi.

## Åbne spørgsmål (skal afgøres før der bygges)

1. **Hvem ejer `build.ts`?** Kundens repo (og deploy henter den) eller vores volumen (og kundens fil skal fjernes)? To kopier uden en ejer er tilstanden vi er i nu.
2. **Gælder det alle sites?** Målt kun på `trail`. `sanneandersen`, `webhouse-site` og `broberg-ai` skal tælles op på samme måde — alder på den beamede `build.ts` mod repoets, og antal commits imellem.
3. **Hvordan opdages det næste gang uden at en peer tilfældigvis kigger?** En alder på den beamede kopi, eller en sammenligning mod repoets HEAD, hører til i site-valideringen.

## Reuse

Discovery-tjek udestår — dette er en intern deploy-mekanisme (ICD/beam), og der findes ingen `@broberg/*`-pakke for «hold en beamet projektkopi i sync med et repo». Skal alligevel køres inden implementering, sammen med spørgsmål 1.

## MIDLERTIDIGT PLASTER — skal rulles tilbage

2026-09-02, på Christians ordre videresendt af trail: **Pricing-menupunktet er fjernet** fra `global.navLinks[2]` og `global.footerLinks[2]` på site `trail`, fordi et dødt link er værre end intet link.

**Det skal tilbage når prissiden kan bygges igen.** trails egen pointe, og grunden til at den står her frem for kun i en intercom-tråd: *en skjult menupost er nemmere at glemme end en død.*

## Uden for opgaven

- trails eget `Landing auto-deploy`-workflow kører `flyctl deploy` mod en Fly-app (`trail-landing`) der ikke findes; sitet ligger på GitHub Pages. Det er deres oprydning — men værd at holde sammen med ovenstående, for det er endnu en vej der aldrig har ført nogen steder uden at nogen læste det røde kryds.
