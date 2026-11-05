# F212 — White-label docs: cms.fysio.work/docs

**Ordre:** Christian 5/11-2026: «Kan vi ikke lave en white-label udgave af docs.webhouse.app som vi lavede en komplet whitelabel udgave for cms.fysio.work — men denne gang skal alt content placeres på cms.fysio.work/docs så vi ikke skal betale for en selvstændig maskine.» Navne-tag: på docs.webhouse.app = `webhouse.app`, på cms.fysio.work/docs = `cms.fysio.work`. Designet følger brandets stil.

**Svar på de åbne spørgsmål (samme dag, GO):**
1. **Alle sider vises.** White-label handler kun om navn og CSS; ingen filtrering af sider pr. brand.
2. **«webhouse» må KUN stå, hvor det henviser til et npm-modul** (`@webhouse/cms` osv.). Alt andet skal følge brandet.
3. **Fysio-udgaven åbner på dansk.**

## Målt før planen (5/11)
- docs.webhouse.app er sin egen Next.js-app, repoet `webhousecode/cms-docs` (Fly-app `cms-docs`, arn, auto-stop). Push til main udruller.
- Indhold: 181 JSON-dokumenter (DA+EN) i `content/docs`, changelog, snippets og 20 AI-guide-markdownfiler i `src/ai-guide`.
- «webhouse» forekommer ~1.000 gange i indholdet: `webhouse.app` 290, `@webhouse/…` ~280 (npm, bevares), «Webhouse/WEBHOUSE» ~180, `docs.webhouse.app` 19 og links til `ai.webhouse.app`.
- Docs-appen har allerede en visnings-tag-mekanisme (`{{snippet:slug}}` i `doc-content.tsx`), som genbruges.
- CMS'et har F210-brandpakken (`packages/cms-admin/src/lib/brand.ts`, valg efter adresse), og `/docs` er ledig i cms-admin.
- Hjælpelinks i cms-admin hardkoder `https://docs.webhouse.app` (`help-drawer.tsx`, `help-card.tsx`, `powered-by.tsx`).

## Arkitektur
1. **Ingen ny maskine.** cms-admins `proxy.ts` sender `/docs` og `/docs/**` på et ikke-standard-brands adresse videre til docs-appen (`DOCS_ORIGIN`, ét sted i `fly.toml`). Det er den maskine, der allerede kører docs.webhouse.app.
   - Cookies og Authorization fjernes, så admin-sessionen aldrig når docs-appen.
   - Headeren `x-docs-brand` bærer brandets *offentlige* data: navn, adresse, farver, logo, favicon, skrift og sprog. Brandpakken forbliver den eneste kilde.
2. **Montering i docs-appen** (kun når headeren er sat og valideret):
   - `/docs` → forsiden. `/docs/<slug>` er uændret (samme sti som på docs.webhouse.app, så hjælpelinks kun skifter origin).
   - Øvrige rod-sider og filer ligger under `/docs/_/…`, og docs-appens proxy omskriver `/docs/_/x` → `/x`.
   - En `href()`-hjælper sætter præfikset på alle interne links, billeder og markdown-links. Next-assets får et `assetPrefix` under `/docs/_`.
   - Under montering sendes `X-Robots-Tag: noindex`, og canonical peger på docs.webhouse.app (ingen dobbelt-indhold på Google).
   - Headerens værdier valideres (hex, `/brands/…`-stier, sprogkode). En spoofet header påvirker kun afsenderens eget svar (ingen delt cache).
3. **Navne-tags i indholdet:**
   - `{{brand}}` → `webhouse.app` | `cms.fysio.work`
   - `{{brand.docs}}` → `docs.webhouse.app` | `cms.fysio.work/docs`
   - `{{brand.ai}}` → `ai.webhouse.app` | `cms.fysio.work/docs/_/ai`
   - Tags erstattes ved visning i brødtekst, titler, metadata, søgning og llms/ai-tekster.
   - Migreringen sker med et script, der kun rører produktnavn og adresser (aldrig `@webhouse/…`, kode-identifiers eller filstier), og et kontrolscript måler bagefter, at fysio-udgaven kun nævner «webhouse» i npm-pakkenavne.
4. **Design:**
   - Brandfarven skrives ind i docs-appens CSS-variabler (i dag `--color-gold` m.fl.) i lyst og mørkt tema.
   - Logo, favicon og skrift (`/brands/<id>/…`) hentes fra samme adresse. cms-admin serverer dem allerede på cms.fysio.work.
   - Sproget er brandets `defaultLocale` (da).

## Historier
- **F212.1** cms: videresendelse af `/docs` på brand-adresser + hjælpelinks følger brandet.
- **F212.2** cms-docs: montering under `/docs` (links, assets, noindex, validering).
- **F212.3** cms-docs: navne-tags + migrering af indhold + kontrolscript.
- **F212.4** cms-docs: design og sprog følger brandet.
- **F212.5** Udrulning og Lens-verifikation på begge adresser.

## Non-goals
- At skjule eller filtrere sider pr. brand. Alle sider vises (Christian).
- At omdøbe npm-pakker, kode-identifiers, filnavne eller interne stier.
- En separat docs-maskine eller -build pr. brand.
- At flytte docs-appen ind i cms-admin. Det er vurderet og fravalgt: mere arbejde og en tungere CMS-server for samme resultat.

## Risici
- **Kold start:** docs-maskinen auto-stopper. Første kald efter pause tager et par sekunder. Det accepteres (som på docs.webhouse.app).
- **Fejl-erstatning af «webhouse»** i kodeeksempler: scriptet kører med en allowlist af mønstre, og diffen gennemgås før commit.
- **En ny rod-side i docs-appen** skal virke under `/docs/_/`. `href()`-hjælperen dækker alle sider, og proxy-omskrivningen er generisk.

## Udrulning
F212.2–F212.4 udrulles først til docs-appen. Uden headeren er docs.webhouse.app uændret, så udrulningen er mørk. Derefter tændes F212.1 i cms, og cms.fysio.work/docs går live.
