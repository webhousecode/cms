# F197 — Brandfarven i paletten, og den følger temaet

> **Christian 11/9-2026:** *«Jeg mangler den farve der er i .ai i logoet i paletten
> så jeg selv kan farve linje 2 flere steder»* — og præciseret: *«Altså som
> standard farve.»*

## Den målte årsag

`siteFarver()` i `src/site-colors.ts` henter `:root`-variabler i
DEKLARATIONS-rækkefølge og stopper ved `maks = 10`. På broberg.ai:

```
 1. --blue           #00b2ff
 2. --blue-light     #40c8ff
 3. --blue-glow      rgba(0,178,255,.13)   ← et skær på 13 %
 4. --blue-glow2     rgba(0,178,255,.06)   ← et skær på 6 %
 5. --dark           #23282f
 6. --dark2          #1c2027
 7. --paa-blaa       #04222f
 8. --card           rgba(255,255,255,.04) ← en flade
 9. --card-border    rgba(255,255,255,.08) ← en kant
10. --light          #f0f4f8
── loftet ──
13. --orange-text    #ff6a45                ← BRANDFARVEN
```

Fire af ti pladser går til noget ingen ville farve tekst med.

## Hvorfor loftet ikke er den egentlige fejl

Det oplagte er at hæve `maks` eller at frasortere lav-alfa-værdier. Begge dele er
forkerte, og components skar igennem hvorfor:

**En fast hex kan ikke overleve et temaskift.** `--orange-text` er `#ff6a45` i
mørkt og `#c93a16` i lyst tema — forskellige med vilje, fordi den lyse skal
kunne læses på hvid (WCAG AA). En redaktør der vælger hex'en fra paletten fryser
den ene, og teksten bliver forkert — muligvis ulæselig — i det andet tema. At
rangordne værdier bedre løser ikke at **værdien selv er det forkerte at gemme**.

Og et alfa-filter rammer den forkerte akse: en dæmpet TEKST-farve må gerne bære
alfa, og en flade er alfa 1. Det fejler i begge retninger, og den dag det gør,
ligner det en ødelagt palet frem for en gættet regel.

## Beslutningen: gem KLASSEN

components' pointe, som er den bærende i hele kortet:

> *Det gemte skal referere noget sitet kan holde sandt.*

| gemt i dokumentet | hvad der brækker det |
|---|---|
| `color:#ff6a45` | et temaskift |
| `color:var(--orange-text)` | en omdøbning af tokenet — tavst, uden migrering |
| `class="o"` | **intet.** Klassen defineres af sitet; at holde den sand er sitets eget arbejde |

Sitet har allerede mønstret: `<em class="o">` i overskrifterne.

## Konventionen

Sitet ERKLÆRER hvad paletten må tilbyde, frem for at pakken gætter:

```css
:root {
  --cms-farve-o: var(--orange-text);   /* klassen .o, svatchen males i denne farve */
  --cms-farve-o-navn: "Brandfarve";    /* valgfri etiket */
}
```

- **Klassen står i VARIABELNAVNET** — `--cms-farve-o` → `class="o"`.
- **Værdien bruges KUN til at male svatchen.** Den læses med `getComputedStyle`,
  så svatchen automatisk viser den rigtige farve i det tema redaktøren står i —
  mens det gemte indhold aldrig indeholder en værdi.
- **Intet loft.** En erklæret liste er en beslutning; ti tilfældige er et gæt.

Prior art fra components: `@broberg/theme`s `designTokensFromCss()` returnerer et
`skipped[]` med en GRUND pr. udeladt deklaration. Den løser ikke dette — den
udtrækker tokens til en DESIGN.md-rundtur, ikke «må en tekst-farvevælger tilbyde
denne» — men formen er den rigtige, og den er værd at læse før nogen skriver en
klassifikator nummer to over samme CSS.

## Scope

**Med:**

1. `siteKlasser()` i `site-colors.ts` — læser `--cms-farve-*`.
2. En række i farvevælgeren der påfører KLASSEN på markeringen.
3. Serialiseringen skal bevare klassen.
4. broberg-ai-site: erklær variablerne og bred `em.o` til `.o`.

**Ikke med:**

- At ændre eller fjerne den eksisterende værdi-baserede palet. Sites uden den nye
  konvention skal opføre sig NØJAGTIG som i dag — det er den bærende negative
  kontrol.
- En delt token-klassifikator i `@broberg/theme`. components har tilbudt at bygge
  den; den beslutning hører til når vi ved om vi får brug for mere end denne
  konvention.

## Reuse

| capability | beslutning |
|---|---|
| Palet-UI, svatcher, ankre | **Genbrug** — `svatch()`, `raekke()`, `testidNavn()` findes i pakken |
| Læsning af `:root`-variabler | **Genbrug** — `variabelNavne()` findes og håndterer allerede cross-origin-ark |
| Token-klassifikation | **Ikke bygget** — `@broberg/theme` har prior art; vi tilføjer ikke en klassifikator nr. to |

## Rollout

Additiv: en ny række der kun vises når sitet erklærer noget. Ingen eksisterende
adfærd ændres, hvilket skal BEVISES med en negativ prøve frem for antages.
