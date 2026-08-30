# F180 — Et select-label må ikke gentage et tal der bor et andet sted

**Status:** I gang — Christian gav GO 30. august 2026
**Fundet:** 30. august 2026, under sanneandersens gebyr-rettelse
**Kilde:** intercom sanne ↔ cms #24109 → #24137

---

## Hvad der skete, og hvorfor det er en motor-mangel og ikke en enkeltsag

Sanneandersen tog 30 % i provision af fremmøde-undervisning, fordi produkttypen
`course` var stemplet `digital`, og digital = 30 %. Iris-kurset (4.950 kr) kostede
hende 1.485 kr; det 2-årige forløb ville have kostet 17.550 kr. Den manglende
kategori `attendance` blev tilføjet til `product-types.kind`, og satserne står nu
rigtigt: fremmøde 1 %, leveret online 30 %, fysisk vare 5 %.

For at Sanne kan SE hvad et valg koster, skrev vi satsen ind i selve label-teksten:

```ts
{ value: "digital", label: "Leveret online — webinar, ebog, lydfil (30%)" }
```

**Og dermed findes tallet nu to steder.** Det rigtige bor i forbrugerens
`PLATFORM_FEE_PERCENT` (sanneandersens `site/src/lib/stripe/fees.ts`), hvor gebyret
faktisk beregnes. Ændres satsen dér, lyver labelen indtil nogen håndretter den her
også — og ingen får besked. Det er præcis den drift CLAUDE.md's regel om én kilde
per værdi findes for.

**Målt, ikke antaget:** feltets type er
`options?: Array<{ label: string; value: string }>` i
`packages/cms/src/schema/types.ts` (to steder, linje 35 + 336). Rene strenge. Ingen
callback, ingen reference, intet der evalueres ved schema-push eller ved render. Så
der findes ingen vej i dag — duplikatet var ikke sjusk, det var det eneste mulige.

## Det forkerte alternativ, og hvorfor det er forkert

Sanne-sessionen foreslog først at satserne flytter over til CMS'et, og trak det selv
igen: *«det ville gøre en generisk indholdsmotor til ejer af én kundes gebyrmodel.
Næste kunde med en anden aftale har så to steder at rette, og problemet er bare
flyttet en etage op.»*

Det er den rigtige analyse. Spørgsmålet er ikke hvor tallet kan LIGGE, men hvem der
skal EJE det. Gebyrmodellen er forbrugerens forretning; CMS'et er motoren.

## Den ønskede opdeling

Labelen navngiver **kategorien** og intet andet:

```ts
{ value: "digital", label: "Leveret online — webinar, ebog, lydfil" }
```

… og satsen vises **ved siden af**, hentet fra forbrugerens egen config når admin'en
tegner feltet. Ét tal ét sted, og teksten kan ikke lyve.

## Den svære halvdel, som sanne pegede på

Admin'en tegner feltet på **webhouse.app**, men tallet bor i **forbrugerens repo**.
Mekanismen skal altså læse en værdi fra et site den ikke selv deployer — en anden
slags kobling end at et schema-felt refererer noget i CMS'et selv. Det er her
designet skal træffe sit valg:

| | Push | Pull |
|---|---|---|
| Hvordan | forbrugeren sender tallene med når skemaet landes | admin'en henter dem live fra sitet |
| Pris | bliver stale på samme måde som i dag — løser kun halvdelen | kræver et endpoint OG en defineret fejltilstand når sitet er nede |
| Risiko | duplikatet består, bare automatiseret | et felt der ikke kan tegnes fordi et fremmed site er nede |

**Valget skal træffes eksplicit i denne plan-doc før der skrives kode**, ikke
afgøres af hvad der var nemmest. Sanne har bevidst ingen mening: *«det er jeres
motor, og I kan se konsekvenserne for de andre 20 collections som jeg ikke kan.»*

## BESLUTNINGEN — truffet 30. august, før der blev skrevet kode

**Hverken push eller pull-fra-et-fremmed-site. Værdien refereres fra sitets EGET
CMS-indhold, som admin'en allerede læser.**

Tabellen ovenfor stillede et falsk valg. Den antog at tallet kun kan bo i
forbrugerens repo. Målt viser det sig ikke at holde:

- **`SiteConfig` er CMS'ets egne indstillinger** — `previewSiteUrl`,
  `schemaEditEnabled`, `capabilities`, AI-modeller, deploy-opsætning. Et fast
  skema vi ejer. En kundes gebyrsats hører ikke til der, og det er den samme
  ejerskabsfejl sanne selv trak tilbage.
- **Men sanneandersen har en `global`-collection med `kind: "global"`**, og dens
  egen beskrivelse siger hvad den er til: *«Site-wide config (one record per
  locale) … Sanne kan redigere her i CMS — sitet henter alt herfra ved render.»*

Det sidste led er hele svaret. **Sitet læser allerede alt derfra ved render.**
Ligger satsen i `global`, læser forbrugerens checkout og admin'ens felt fra
SAMME dokument. Så er der én kilde — ikke to der holdes enige.

| | Hvad det koster |
|---|---|
| ~~Push~~ | arver staleness fra i dag. Løser kun halvdelen. **Forkastet.** |
| ~~Pull fra fremmed site~~ | nyt endpoint hver forbruger skal bygge, netværkskald midt i en admin-render, og et felt der ikke kan tegnes når et andet site er nede. **Forkastet.** |
| **Reference til sitets eget indhold** | forbrugeren skal FLYTTE tallet til `global`. Ingen ny transport, intet fremmed-site-afhængighed, ingen ny kontrakt mellem repoer. **Valgt.** |

### Det denne feature IKKE gør, og som skal siges højt

CMS-siden leverer **muligheden**. Den leverer ikke i sig selv «én kilde».

Bliver `PLATFORM_FEE_PERCENT` stående i forbrugerens TS-modul *og* vi renderer
fra `global`, så har vi to kilder igen — bare pænere. Forbrugeren skal flytte
værdien og læse den fra `global`. Det er sanneandersens arbejde, ikke vores, og
det skal stå på deres kort, ellers ser denne feature færdig ud uden at være det.

### Formen

En option må bære en `note` med en eller flere `{{sti}}`-pladsholdere, slået op i
sitets eget indhold:

```ts
{ value: "digital", label: "Leveret online — webinar, ebog, lydfil",
  note: "{{global.fees.digital}}%" }
```

Labelen navngiver kategorien. `%` er præsentation og hører hjemme i noten. Tallet
kommer fra kilden.

**Stien er `<global-collection>.<felt-sti>`** — kun collections med
`kind: "global"` i v1. De har præcis ét dokument, så der er intet slug at gætte
på og ingen forespørgsels-syntaks at opfinde. En `data`-collection ville kræve et
slug og dermed en query; det er ikke nødvendigt for at løse dette og er holdt ude.

**Grænsen, med vilje:** dette er en UDSKIFTNING, ikke en skabelon-motor. Ingen
betingelser, ingen løkker, ingen filtre, ingen udtryk. Kun `{{sti}}` → værdi.
Kan en sti ikke slås op, forsvinder pladsholderen og resten af noten bliver
stående — feltet er stadig brugbart. En manglende sats må aldrig spærre for at
vælge en kategori.

## Afgrænsning

**Ikke med:** at flytte gebyrsatser ind i CMS'et (afvist ovenfor), at ændre
sanneandersens nuværende labels (de står med vilje til denne findes), en generel
skabelon-syntaks i schema-labels.

## Status i mellemtiden

Gælden er accepteret med åbne øjne i begge ender. Sanne: *«et forkert label er
mindre skadeligt end intet label»* — Sanne skal kunne se hvad et valg koster.
Noteret på deres F104 som en rådgivende note med målingen citeret, så den næste der
læser kortet kan se at det var et valg og ikke en forglemmelse.


---

## AFVIST 30. august: satsen flytter IKKE ind i `global`

sanne-sessionen afviste implementeringens skridt 1 og begrundede det med tre
målinger frem for en indvending. To af dem er efterprøvet i dette repo og holder.

**1. Ingen rolle-lås findes.** `global` er `kind: "global"` og dens egen
beskrivelse siger «Sanne kan redigere her i CMS». Satsen er WebHouse' provision —
det kunden BETALER os. Lægges den der, kan den der betaler gebyret redigere
gebyret i sin egen admin. **Efterprøvet:** eneste lås i `FieldConfig` er `aiLock`
(types.ts:71). Ingen `adminOnly`, ingen `editableBy`, ingen `readOnly`. Der er
ikke noget at låse med.

**2. Fail-open i penge-stien.** Forbrugerens `readGlobal()` returnerer et
minimalt objekt når dokumentet mangler i stedet for at kaste, så `fees?.digital`
bliver `undefined` og undefined i et gangestykke bliver 0 eller NaN. I dag er
satsen en compile-time-konstant der ikke KAN være fraværende. Vi ville bytte «et
label der kan blive forældet» for «en provision der tavst kan blive nul midt i en
betaling» — et fravær der ser ud som et svar.

**3. Tal gemmes som strenge.** Målt på prod: `priceDkk: "4950"`. **Efterprøvet, og
det er værre end det så ud derfra:** `number` er en erklæret felttype, men
`field-editor.tsx` har ingen `case "number"` — den falder igennem til `default:`,
som renderer et tekstfelt og skriver `e.target.value`, altså en streng. Hvert
number-felt på hvert site har gemt en streng hele tiden. **Egen defekt → cms-F181.**

### Den fjerde læsning, som ingen af siderne havde

sannes punkt 1 er rigtigt, men konklusionen «så bliver det i forbrugerens repo»
følger ikke. **Satsen er ikke kundens forretningstal — den er WebHouse' provision
PÅ kunden**, et kommercielt vilkår WebHouse ejer. I dag bor det i kundens eget
repo, hvor kunden og enhver session i det repo kan ændre det lige så frit. Samme
problem, bare mindre synligt.

Det peger på en placering ingen af de tre foreslåede rammer: **platform-siden, pr.
lejer, hvor WebHouse styrer og kunden kan LÆSE.** Det er Christians beslutning —
spørgsmålet er hvem der må ændre et kommercielt vilkår, ikke hvor en variabel
teknisk kan ligge.

### Hvad der står tilbage

**F180 bliver stående som bygget.** Note-mekanismen er rigtig; den bliver brugbar
det øjeblik der findes en kilde som ikke kan redigeres af den der betaler. Ingen
`note` sættes på sanneandersen før den kilde findes — procenterne bliver i
label-teksten så længe, som accepteret gæld i begge ender.

**Forudsætning tilføjet:** en rolle-lås på feltniveau (eller platform-side
lagring) er nu en blokerende afhængighed for at F180 kan bruges til netop
gebyrsatser. Til andre værdier — noget kunden selv ejer og gerne må rette — er den
brugbar i dag.
