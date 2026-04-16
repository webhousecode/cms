Byg et website om Miles Davis med @webhouse/cms.

FØRST: hent https://ai.webhouse.app og følg Step 0–9 — det er den
selvstændige AI Builder walkthrough for @webhouse/cms. Alle detaljer om
cms.config.ts, felttyper, content-format og deploy ligger der.

Dette er et from-scratch-projekt — brug IKKE en template/boilerplate.
Kig gerne på /ai/02-config-reference, /ai/03-field-types og
/ai/10-config-example når du mangler dybde, men skriv alt selv.

STACK — præcis denne, uden afvigelser:
- Runtime/build:   Bun (dev process) + Vite 5.4 (dev server + prod bundler)
- Framework:       Preact 10.23 (med React→preact/compat alias for React-libs)
- Routing:         preact-iso
- Prerender:       @preact/preset-vite's prerender til statisk HTML per route
- Styling:         Tailwind v4 CSS-first via @tailwindcss/vite (ingen tailwind.config.ts)
- Komponenter:     shadcn-style, hand-rolled med utility classes
- Icons:           Inline SVG, hand-drawn (intet icon-bibliotek)
- CMS:             @webhouse/cms seneste version (filesystem adapter)

INDHOLD om Miles Davis:
- Collection `albums` (kind: page, urlPrefix: /albums) — titel, år, label,
  cover-image, personnel (array: musiker + instrument), tracks (array:
  titel + længde), richtext liner notes, tags for era/stil
- Collection `eras` (kind: page, urlPrefix: /eras) — kort liste over
  hans 5 store perioder (Bebop, Birth of the Cool, Hard Bop/First Quintet,
  Modal/Second Quintet, Electric/Fusion) med tagline, årstal, richtext
- Collection `quotes` (kind: data) — citat-strøm renderet på forsiden
- Collection `global` — site-titel "Kind of Blue", nav, footer

Layout: mørk, jazzet æstetik — sort baggrund, off-white tekst, accent
i en dæmpet guld (som Blue Note-covers). Serif til overskrifter
(fx "Playfair Display" via Google Fonts inline @import), sans-serif til
brødtekst. Ingen farve-spam — lad coverne bære farverne.

Sider:
- /               → hero med "Miles Dewey Davis III (1926–1991)",
                    tidslinje-strip med de 5 eraer, random citat fra
                    quotes-collection
- /albums         → grid af covers (4 kolonner desktop, 2 tablet, 1 mobile)
- /albums/:slug   → stort cover, personnel-tabel, track-listing, liner notes
- /eras/:slug     → én æra med markdown-artikel
- /about          → side om projektet

Seed 6 ikoniske albums (Kind of Blue, Bitches Brew, Birth of the Cool,
Sketches of Spain, In a Silent Way, On the Corner) med rigtige
personnel/tracks/labels fra 1959–1972. Hent covers som placeholder fra
Wikimedia eller brug lokal /public/uploads/. 10+ autentiske Miles-citater.

Deploy-mål: GitHub Pages (statisk, prerenderet). Ingen SSR.
