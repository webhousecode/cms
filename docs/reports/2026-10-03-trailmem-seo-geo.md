# trailmem.com — SEO- og GEO-gennemgang

*Målt 3. oktober 2026 af cms-sessionen på det live site (www.trailmem.com). Til trail.*

**Kort fortalt:** Fundamentet er godt. Sitet er hurtigt, har lange, faglige artikler og er åbent for AI-crawlere med llms.txt og llms-full.txt. Det, der holder placeringerne nede, er tekniske signaler, der mangler eller peger forkert: ingen canonical, ingen delingsbilleder, artikler der ikke markeres som artikler, alt for lange titler og 50 tynde tag-sider, der fylder to tredjedele af sitemap'et. Det meste kan rettes i én omgang i `build.ts`.

---

## Det der allerede virker

| | Målt |
|---|---|
| Hastighed | Forsiden svarer på 0,04 s (GitHub Pages + Fastly, edge i København). |
| HTTPS og domæne | `trailmem.com` → 301 → `https://www.trailmem.com/`. Én version af sitet. |
| Indhold | Artiklerne er lange og faglige, fx «Compile-Time Knowledge» med ~2.800 ord, én H1 og klar struktur. |
| AI-adgang (GEO) | robots.txt tillader alt. llms.txt i sektioner, llms-full.txt (202 KB fuld tekst) og ai-plugin.json findes. |
| Sitemap | 76 URL'er med `lastmod` fra indholdets egne datoer. |

---

## Rettet af cms i dag

**Canonical manglede på alle 26 indholdssider (0 af 26).** Fejlen lå i cms' berigelse, ikke hos jer. Jeres client-side router har strengen `link[rel="canonical"]` i et inline-script. Berigelsen troede derfor, at tagget fandtes, og sprang over. Rettet i `@webhouse/cms` 0.4.26 (F206.9). Jeres næste build med 0.4.26 giver canonical på alle sider. **Bump og mål, at `<link rel="canonical">` står i HTML'en.**

---

## Prioriteret liste til trail

### 1 · Høj effekt, lille arbejde

**1.1 Delingsbillede (og:image) på alle sider.** Kun 2 af 26 sider har et. Uden billede bliver links på LinkedIn, Slack, X og i AI-svar vist som grå tekstbokse, og det koster klik.
→ Lav et standardbillede på 1200×630 (logo + titel), og send det som `siteImage` til `enrichDist`. Giv gerne hver artikel sit eget billede via `_seo.ogImage`. Skift samtidig `twitter:card` fra `summary` til `summary_large_image`.

**1.2 Titler under ~60 tegn.** Forsidens titel er 100 tegn: «Knowledge Infrastructure for the AI Era — Trail reads every source you give it — trail: second brain». Google afkorter efter cirka 60 tegn, så brandet forsvinder.
→ Formel: `<sidens emne> — Trail`. Forside fx «Trail — Knowledge infrastructure for the AI era». Drop det dobbelte suffiks.

**1.3 Beskrivelser på 140–160 tegn.** Forsidens meta-beskrivelse er 243 tegn og bliver klippet.

**1.4 Ét navn og én påstand.** Sitet kalder sig både «trail: second brain», «Trail» og «trail». Forsidens beskrivelse («Trail reads every source …») og sitets beskrivelse i llms.txt og JSON-LD («A minimalist engine to ingest … geometric precision») er to forskellige budskaber. AI-modeller citerer det, der står konsekvent mange steder.
→ Vælg ét navn og én sætning, og brug dem i `siteName`/`siteDescription`, i forsidens `<title>` og i JSON-LD.

### 2 · Høj effekt, mellem arbejde

**2.1 Artikler skal markeres som artikler.** I dag har artiklerne `@type: WebPage` uden dato og forfatter. Google og AI-søgemaskiner vægter `Article`/`BlogPosting` med `datePublished`, `dateModified` og `author` (E-E-A-T: hvem står bag?).
→ JSON-LD'en kommer fra jer (build.ts eller `_seo.jsonLd`), så den skal rettes hos jer. Brug `"@type": "Article"`, `headline`, `datePublished`, `dateModified`, `author` (Person med navn og url), `publisher` (Organization med logo) og `image`. Vis også dato og forfatter synligt på siden (`<time datetime>`).

**2.2 Organisations- og produktdata på forsiden.** Tilføj `Organization` (navn, logo, url, `sameAs` → LinkedIn, GitHub, broberg.ai) og `SoftwareApplication` (navn, kategori, `offers` hvis der er pris). Det er det, Googles vidensboks og AI-svar bruger til at forstå, hvad Trail er.

**2.3 De 50 tag-sider.** De udgør 50 af 76 URL'er i sitemap'et og har ~150 ord, beskrivelsen «Content tagged lab.» og mange kun én artikel. Google ser det som tyndt indhold og bruger crawl-tid på dem.
→ Vælg én af to: (a) `noindex` på tag-sider med under 3 artikler og fjern dem fra sitemap'et, eller (b) giv de 5–10 vigtigste tags en rigtig indledning på 100–200 ord, så de bliver emnesider. Fjern resten.

**2.4 FAQ på forsiden og produktsiderne.** 5–8 spørgsmål som «Hvad er forskellen på Trail og RAG?», «Hvor ligger mine data?» og «Hvad koster det?» med korte, faktuelle svar, markeret med `FAQPage`. Det er præcis den form, AI-søgning løfter direkte ind i sine svar.

### 3 · GEO — at blive citeret af ChatGPT, Perplexity, Gemini og Claude

**3.1 Bing Webmaster Tools + Google Search Console.** Ingen af dem er verificeret, så vidt jeg kan se. Det har jeg ikke kunnet måle. ChatGPT-søgning bygger på Bings indeks, så det er mindst lige så vigtigt som Google. Indsend sitemap'et begge steder, og slå IndexNow til, så nye artikler bliver fundet med det samme.

**3.2 Svar først, uddyb bagefter.** Start hver artikel med et resumé på 2–3 sætninger, der svarer på titlens spørgsmål. AI-modeller citerer de første klare, faktuelle sætninger. «RAG is a search engine wearing a language model as a hat» er en god, citerbar sætning. Lav flere af den slags, og hav tal og kilder med.

**3.3 Sammenligningssider.** «Trail vs NotebookLM», «Trail vs RAG», «Trail vs Notion AI». Folk spørger AI direkte om sammenligninger, og en side med netop den titel bliver den, der citeres. Tagget `comparison` findes allerede, så indholdet er på vej.

**3.4 Egen definition.** Lav en side, der definerer jeres begreb, fx «What is compile-time knowledge?», med en kort definition øverst. Når andre bruger begrebet, peger AI tilbage på den, der definerede det.

### 4 · Autoritet (PageRank)

Placeringer afgøres i sidste ende af, hvem der linker til jer. Jeg kan ikke måle backlinks herfra.
- Link fra broberg.ai og webhouse.dk til trailmem.com, og den anden vej. Det er allerede delvist på plads.
- Skriv gæsteindlæg eller indlæg om memex, Zettelkasten eller Karpathys LLM-wiki-idé, der linker tilbage til jeres artikler. Det er de emner, jeres tags handler om, og der findes fællesskaber omkring dem.
- Læg «The 1945 concept»-artiklen på Hacker News og relevante Reddit-tråde. Historiske, velskrevne artikler får links.
- Hold `lastmod` ærlig. Den er rigtig nu, så lad være med at bumpe datoer uden reel ændring.

### 5 · Småting

- `/favicon.ico` giver 404. Ikonet findes som `/uploads/favicon.svg`, men nogle crawlere og browsere spørger efter .ico. Læg en kopi i roden.
- 404-siden er GitHub Pages' standardside. Lav en `404.html` med navigation og søgning.
- Forsiden har ingen `<img>`, og H1 består af to skiftende tekster i ét tag. Sørg for, at den synlige og den skjulte (`aria-hidden`) H1 ikke giver to konkurrerende overskrifter. Lad den primære indeholde jeres søgeord.

---

## Rækkefølge jeg ville tage det i

1. Bump `@webhouse/cms` til 0.4.26 og byg, så canonical kommer på. Mål det.
2. Punkt 1.1–1.4: delingsbillede, titler, beskrivelser og ét navn. En eftermiddags arbejde.
3. Punkt 3.1: Search Console og Bing Webmaster. Christian skal selv bekræfte domænet. Det er ét klik pr. tjeneste, når DNS-recorden er lagt (via buddy).
4. Punkt 2.1–2.3: Article-schema, Organization og tag-oprydning.
5. Løbende: 2.4, 3.2–3.4 og 4. Det er indholdsarbejde.

## Ikke målt

Core Web Vitals, fordi PageSpeed-API'ets kvote var opbrugt. Backlinks og nuværende placeringer, fordi det kræver Search Console. Om Google allerede har sitet i sit indeks.
