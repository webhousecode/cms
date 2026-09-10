# F195 — Planlæggeren kører på serverens ur, og .ics dør af én dårlig post

> **Christian 10/9-2026**, som svar på to punkter jeg lagde frem: **«1 ret, 2 ja.»**
> To adfærdsændringer i produktion, begge på hans direkte ordre.

## Hvorfor de kommer NU, og ikke før

F194 rettede hvad kalenderen **viser**. Disse to er hvad systemet **gør** — og de
blev først synlige fordi visningen blev ærlig. Kalenderen siger nu 05.00, mens
indstillingen siger 03.00. To tal om samme begivenhed, på samme skærm, der
modsiger hinanden.

## Reuse

Discovery-søgning på «scheduler», «cron», «timezone» inden planen blev skrevet.

- **`@broberg/ui-controls-core`** ejer kalender-MATEMATIK (gitter, datostrenge).
  Den ejer ikke planlægning, og efter F016.8's samtale med `components` er det
  bevidst: enhver fremtidig API dér der rører «nu» skal tage zonen som et
  **krævet argument**. Der er altså intet at genbruge, og heller intet at filere.
- **`lib/dansk-tid.ts`** (vores egen, F194) er det der skal genbruges. Den findes
  allerede, den er prøvet under fem maskin-zoner, og pointen med dette kort er
  netop at planlæggeren ikke kalder den.
- **Ingen ny afhængighed.** `Intl` med `timeZone` er nok, og det er hvad
  `dansk-tid.ts` allerede indkapsler.

**Beslutning: genbrug vores egen hjælper, byg intet nyt.**

---

## F195.1 — Backup og link-tjek kører på dansk tid

### Målt i produktion 10/9, før noget blev rørt

Containeren er UTC (`date` og `date -u` giver samme svar; `TZ` er ikke sat).

| site | indstillet | kører faktisk (dansk sommertid) |
|---|---|---|
| sanneandersen | 01.00 | **03.00** |
| webhouse-site | 02.00 | **04.00** |
| broberg-ai | 03.00 | **05.00** |
| trail | 04.00 | **06.00** |

Alle fire kører dagligt. Link-tjek er slået fra på alle fire i dag, men samme
kode afgør det, så den følger med.

### Tre steder, ikke ét

`isDue()` i `lib/tools-scheduler.ts` læser maskinens zone tre gange, og hver af
dem er en selvstændig fejl:

```ts
scheduledToday.setHours(hh, mm, 0, 0);   // 1. tidspunktet
if (schedule === "weekly" && now.getDay() !== 1) return false;   // 2. «mandag»
if (lastRunDate.toDateString() === now.toDateString()) return false;  // 3. «i dag»
```

At rette kun den første ville flytte klokkeslættet og lade «mandag» og «i dag»
blive ved med at være UTC's. **Det er kortets egen fejlform, og den er værd at
navngive her**: en rettelse formet af det der blev rapporteret lukker den halvdel
der blev nævnt. Rapporten handlede om klokkeslættet.

### Hvad det betyder for kunderne

Backups flytter **to timer tidligere** om sommeren, én time om vinteren. Det er
den ændring Christian har bestilt: tallet i brugerfladen bliver sandt.

`sanneandersen` kl. 01.00 dansk er `23.00 UTC dagen før` — den kant hvor den
danske dag og UTC-dagen er forskellige. Præcis derfor skal punkt 3 («har den
kørt i dag») også være dansk, ellers kan den køre to gange eller springe over.

### Acceptkriterier

1. `isDue()` afgør tidspunkt, ugedag og «har kørt i dag» i `Europe/Copenhagen`,
   via `lib/dansk-tid.ts`. Ingen `setHours`/`getDay`/`toDateString` på maskinens
   zone tilbage i filen.
2. Prøvet under mindst fire maskin-zoner (UTC, Europe/Copenhagen,
   America/New_York, Pacific/Auckland) med samme forventede svar. En prøve der
   kun består på min Mac er præcis den fejl F194 allerede kostede os.
3. Sommertid begge veje: en vinterdato (UTC+1) og en sommerdato (UTC+2). Et fast
   offset skal gå rødt på den ene.
4. **Kanten kl. 01.00 dansk** har sin egen prøve: 23.00 UTC dagen før er samme
   danske dag som 01.00, og «har kørt i dag» må ikke svare forkert dér.
5. **Negativ kontrol:** en tid der IKKE er forfalden må stadig svare nej.
   Uden den består en `isDue()` der altid siger ja.
6. Mutations-prøvet: skiftes zonen til UTC eller genindføres `setHours`, går
   mindst én prøve rød hver gang — og mutationen skal bevises LANDET før den
   måles.

---

## F195.2 — Ét dårligt punkt må ikke tage hele abonnementet

### Hvad det kostede i dag

`calendar.ics` kører hver post gennem `icsUtc()` inde i **én** `try/catch` der
omslutter hele svaret. En zoneløs dato fra en glemt kopi af `localISO()` gav
derfor **HTTP 500 for hele feedet** — på alle fire produktionssites, i et døgn,
uden at nogen opdagede det.

Årsagen er rettet (`ecc598d6`). **Formen er ikke.** Enhver fremtidig dato der
ikke kan formateres har stadig samme sprængkraft.

### Hvad der bygges

Hver post formateres for sig. En post der ikke kan formateres **springes over**,
og feedet leverer resten.

**Den må ikke springes over i tavshed.** En tavs udeladelse er den samme
fejlklasse som den vi lukker: kalenderen ser hel ud og mangler noget. Derfor:

- den udeladte post logges med sin `id` og grunden, så den kan findes;
- feedet bærer en `X-WR-CALDESC`-linje der siger hvor mange poster der blev
  udeladt, når tallet er over nul.

### Ikke-mål

- **Ingen «reparation» af en dårlig dato.** At gætte en zone er præcis det
  `dansk-tid.ts` blev bygget for at nægte.
- **Ingen ændring af hvad en gyldig post udsender.** Feedet skal være tegn for
  tegn det samme når intet er galt.

### Acceptkriterier

1. En snapshot med én ubrugelig dato giver **200** og et feed med alle de øvrige
   poster — ikke 500.
2. Den udeladte post nævnes i loggen med sin id og grunden.
3. `X-WR-CALDESC` oplyser antallet af udeladte poster, og linjen mangler helt
   når tallet er nul.
4. **Uændret i den normale tilstand:** et feed uden dårlige poster er byte for
   byte identisk med før ændringen. Det er den prøve der forhindrer at
   robustheden ændrer produktet.
5. Mutations-prøvet: fjernes per-post-beskyttelsen, går prøven i punkt 1 rød.

---

## Rækkefølge

F195.1 og F195.2 er uafhængige og kan udrulles hver for sig. F195.1 flytter
kundernes backups og er den der skal måles i produktion bagefter — næste kørsel
skal ske på det danske klokkeslæt, verificeret mod `tools-scheduler-state.json`.
