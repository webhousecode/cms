# F194 — Kalenderen regnede i serverens UTC og kaldte det dansk tid

> Christian 10/9-2026: «Ret timeZone-fejlen i cms-kalenderen nu.»

## Først en rettelse af min egen melding

Jeg fortalte Christian at kalenderen bruger `toLocaleDateString` **uden**
`timeZone`. **Det gør den ikke** — der er nul `toLocale`-kald i filen. Jeg havde
genkendt en fejlfamilie fra husreglen og meldt den som en måling. Fejlen er
virkelig nok; den sidder bare et andet sted, og den er større.

## Målt før noget blev rørt

**Containeren kører UTC.** `flyctl ssh console --app webhouse-app`:

```
date -u   Thu Sep 10 09:14:07 UTC 2026
date      Thu Sep 10 09:14:07 UTC 2026
TZ=       (tom)
```

Tre steder regner i den zone og præsenterer resultatet som dansk.

### 1. Klienten grupperer på den forkerte dag

```ts
const key = e.date.slice(0, 10);      // calendar-client.tsx:45
```

For en UTC-ISO-streng er de ti tegn **UTC-dagen**:

```
begivenhed          2026-09-09T22:30:00Z
slice(0,10)      →  2026-09-09     ← den dag den vises på
faktisk dansk dag →  2026-09-10
```

### 2. `localISO()` udsender serverens vægur uden zone

```ts
`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:…`
```

Læser UTC og udelader zonen. Strengen **ligner** lokal tid og er det ikke —
hvilket er værre end en åbenlyst forkert værdi.

### 3. `.ics`-feedet udsender flydende tid

`toIcsDate()` gør det samme og sætter **ikke** `Z`, så modtagerens kalender-app
læser tiden som sin egen lokale. Samme fil erklærer
`X-WR-TIMEZONE:Europe/Copenhagen` — **modsigelsen står i én fil.** Og linje 99
sætter et `Z` BAGEFTER en lokal aflæsning; i en UTC-container falder de to
sammen, så fejlen er usynlig indtil nogen sætter `TZ`.

## Vinduet

**22.00–24.00 dansk sommertid** (23.00–24.00 om vinteren) — netop det tidsrum
hvor ingen kigger. For en udgivelse er en dag forkert til at leve med. For den
kunde-booking cardmem skal bygge på samme UI er det **en aflyst tid**.

## Rettelsen

Én fælles hjælper der oversætter et **øjeblik** til dansk kalenderdag og dansk
vægur via `Intl.DateTimeFormat` med `timeZone: 'Europe/Copenhagen'`. Alle tre
steder læser den.

**Zone-NAVNET, aldrig et offset.** Danmark er UTC+1 om vinteren og UTC+2 om
sommeren, så «laeg to timer til» er forkert et halvt år ad gangen — en fejl med
et halvt års lunte som ingen kobler til sin årsag. Navnet bruges allerede tre
andre steder i repoet (`forms/notify`, `forms/field-value`,
`podcast/valutakurs`), så det er husets konvention og ikke et nyt valg.

**Lagring og sammenligning bliver ved med at være UTC.** Det er kun
PRÆSENTATIONEN der får en zone. Læser nogen denne plan som en tilladelse til at
gemme lokal tid, har de læst den bagvendt.

**`.ics` udsender `…Z`** regnet fra det rigtige øjeblik. Utvetydigt, og enhver
kalender-app konverterer selv til beskuerens zone — hvilket også er det rigtige
for en modtager der ikke sidder i Danmark.

## Ikke-mål

- **Ingen per-site tidszone-indstilling.** Der findes ingen i dag, og at
  indføre en her ville være at bygge en valgmulighed ingen har bedt om oven på
  en fejlrettelse.
- **Resten af admin'en røres ikke.** Ordren var kalenderen.

## Sådan bevises det

Enhedsprøver på den MÅLTE streng (`2026-09-09T22:30:00Z` → den 10.), og
**sommertid prøvet begge veje** med en vinter- og en sommerdato, så et fast
offset går rødt på den ene. Mutations-prøvet: bytter man Europe/Copenhagen med
UTC, eller genindfører `slice(0,10)`, skal en prøve gå rød hver gang.
