# F210 — White-label af CMS'et

**Ordre:** Christian 22/10-2026: «White-labeling af HELE CMS med et totalt andet skin og et andet navn». Afgrænset samme dag:
- **Én server** (webhouse.app). Ingen separat installation pr. kunde.
- **Kun navn, logo og farver.** Ikke et andet layout eller en anden menu.
- **Adresse:** `cms.kunde.dk`. Første kunde: **cms.fysio.work**.
- **Login:** BID. Er brugeren allerede logget ind med BID på kundens platform (fx fysio.work), er turen til CMS'et en overgang fra app-side til CMS-side, ikke et nyt login.
- «Start oprydningen» — F210.2 og F210.3 går i gang straks.

## Målt før planen (22/10)
| | Antal |
|---|---|
| `#F7BB2E` hardkodet i admin-komponenter | 142 forekomster i 37 filer |
| «webhouse» / «webhouse.app» i admin-skærme | ~100 forekomster i 82 filer (ikke alle brugervendte) |
| Farver allerede som tema-variabler (`app/globals.css`) | 172, inkl. `--primary` (guld) |
| «webhouse» i mobil-appen | 13 filer (uden for scope, se non-goals) |

Halvdelen af udseendet kan allerede skiftes ét sted (`--primary`). Den anden halvdel er spredt.

## Arkitektur
1. **Brandpakke** — én kilde pr. brand: `name`, `logo` (lys/mørk), `favicon`, `primary` (+ evt. accent), `mailFrom`/afsendernavn, `supportUrl`, `hosts` (fx `["cms.fysio.work"]`). Standard-brandet er webhouse og bruges når ingen pakke matcher.
2. **Valg efter adresse** — brandet vælges ud fra `Host`-headeren, ét sted (samme princip som site-kontekst i `proxy.ts`). Ingen cookie, ingen bruger-indstilling: adressen afgør.
3. **Farver** — brandpakkens farve skrives som CSS-variabler (`--primary` m.fl.) i `<head>`. Alle komponenter læser variablerne; ingen hex-værdier i komponenter (husets regel).
4. **Navn og logo** — ét `useBrand()`/`getBrand()`; alle brugervendte «webhouse»-tekster læser derfra.
5. **Alt der forlader systemet** — mails (via `@broberg/mail-core`'s branded shell), invitationer, fejlsider, sidetitler, og hvor AI'en nævner produktets navn.
6. **cms.fysio.work** — DNS via buddy, certifikat på Fly, BID-redirect for den nye adresse, og overgang fra fysio.work uden nyt login.

## Historier
- **F210.1** Brandpakke + valg efter adresse (standard = webhouse).
- **F210.2** Oprydning: 142 hardkodede guld-farver → tema-variabler.
- **F210.3** Oprydning: brugervendte «webhouse»-tekster → brandets navn.
- **F210.4** Mails, invitationer, fejlsider og AI-selvomtale følger brandet.
- **F210.5** cms.fysio.work i drift: DNS, cert, BID-overgang, og fysio.work får besked.

## Non-goals
- Andet layout, anden menu, andre skrifttyper end farve/logo (Christian: «kun navn/logo/farver»).
- Separat installation pr. kunde.
- Mobil-app pr. brand (App Store-app pr. kunde er en særskilt beslutning).
- At skjule BID i login-dialogen (BID's ene dialog, D-cef231; overgang fra kundens app gør det irrelevant for indloggede brugere).
- Kode-identifiers, cookie-navne og interne stier med «webhouse» røres ikke — kun det brugeren ser.

## Reuse
Discovery-søgning 22/10 (`white-label`, `brand`, `theme`):
- **`@broberg/mail-core`** (F023/F043, branded email shell) — BRUGES til F210.4; cms bruger den allerede.
- **`@broberg/theme`** (F001, design tokens + preset) — vurderet: cms-admin har sit eget token-sæt i `globals.css` (172 variabler); en migrering til `@broberg/theme` er ikke nødvendig for white-label og holdes ude for at undgå et redesign. Brandpakken skriver ind i de eksisterende variabler.
- Ingen fælles «brand-resolver»-pakke findes; den bygges i cms.

## Risici
- En hex-erstatning der rammer et sted hvor guld IKKE betyder «brand» (fx en advarselsfarve) — hver erstatning tjekkes, ikke søg-og-erstat i blinde.
- Middleware og route-handlers har hver deres modulkache: brand-opslag må ikke cache for evigt (husets regel om selv-invaliderende kache).
- Dark mode: brandfarven skal virke i begge temaer.

## Udrulning
F210.2/F210.3 kan sendes uden synlig ændring (webhouse ser ud som før). F210.1 sendes mørk (ingen brandpakke = webhouse). F210.5 tændes når 1–4 er grønne.
