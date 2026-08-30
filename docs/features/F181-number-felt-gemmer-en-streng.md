# F181 — Et `number`-felt gemmer en streng

**Status:** Backlog
**Fundet:** 30. august 2026, af sanne-sessionen under F180
**Alvor:** høj — tavs datatype-drift i hvert eneste site

---

## Målingen

`number` er en erklæret felttype i motoren — `packages/cms/src/schema/types.ts:1`
lister den i `FieldType` ved siden af `text`, `boolean`, `date` og resten.

**Men `field-editor.tsx` har ingen `case "number"`.** De 19 grene dækker text,
textarea, richtext, relation, date, boolean, select, tags, image, video, audio,
interactive, file, array, blocks, object, htmldoc, map — og ikke number. Et
number-felt falder derfor igennem til `default:`, som renderer

```tsx
<Input type="text" value={strVal} onChange={(e) => onChange(e.target.value)} />
```

`e.target.value` er en **streng**. Der er ingen `Number()`, ingen `valueAsNumber`,
intet skema der coercer bagefter. Så **hvert `number`-felt på hvert site gemmer
en streng**, og har gjort det hele tiden.

**Bevis fra produktion**, målt af sanne-sessionen på sanneandersens volumen:

```
priceDkk: "4950"    priceDkk: "520"    priceDkk: "2800"
```

Alle tre er priser. Alle tre er strenge.

## Hvorfor det er alvorligt og ikke kosmetik

sanneandersens **F053 var præcis denne fejl på en pris**: `"89" === 89` er falsk,
hver gang, for evigt — og alt så rigtigt ud på nær én markering. Fejlen er ikke
at tallet er forkert; det er at det **sammenlignes forkert** et sted langt fra
hvor det blev skrevet.

De farlige former:

| Udtryk | Med tal | Med streng |
|---|---|---|
| `a === 89` | sand | **falsk** |
| `a > 100` | virker | leksikografisk: `"90" > "100"` er **sand** |
| `a + 1` | 90 | **"891"** |
| `a * 0.3` | 26,7 | virker ved et tilfælde (JS coercer) |
| `JSON` roundtrip | `89` | `"89"` — drift breder sig |

Bemærk række 4: gangestykker virker, fordi JavaScript coercer. **Det er derfor
fejlen har overlevet** — den mest brugte operation på et pristal skjuler den, og
sammenligningen der afslører den ligger et andet sted i koden.

## Omfanget, målt på ét site

sanne-sessionen talte deres egen prod-volumen op — alle 26 collections, felter
hvis navn ligner et tal:

| | Antal |
|---|---|
| gemt som **tal** | 135 |
| gemt som **streng** | **57** |

De 57 er ikke spredt tilfældigt. Hovedparten er `products.priceDkk` (650, 150,
2800, 160 …) — **priser i en levende webshop**.

At blandingen er 135/57 og ikke 0/192 er selv en oplysning: felterne er skrevet
over tid gennem forskellige veje (API-push, import, editoren), og kun editor-vejen
producerer strenge. Så en migrering kan ikke antage at hele feltet er ensartet —
den skal konvertere **pr. værdi**, ikke pr. felt.

Forbrugeren har allerede en `Number()`-coercion i sin shop-kode der redder
**købet**. Den redder ikke en **sammenligning**, og det var præcis hvad
sanneandersens F053 var.

## Hvad der skal ske

1. En `case "number"` der renderer et rigtigt talfelt og skriver et **tal**.
2. **Migrering af eksisterende indhold.** Et felt der i dag er `"4950"` skal blive
   `4950`. Uden dette skridt retter vi kun fremtiden og efterlader hvert
   eksisterende dokument i den tilstand fejlen findes for. Skal køre for alle sites.
3. Tom værdi skal blive `null`/fjernet — **ikke `0`**. `Number("")` er `0`, og en
   pris der stiltiende bliver nul er værre end en der mangler. Egen test, begge veje.
4. `NaN` må aldrig nå disken.

## Afgrænsning

**Ikke med:** at ændre `FieldType`-unionen, at røre andre felttyper, at bygge et
generelt coercions-lag for alle typer (den brede version gør migrationen
umulig at revidere).

## Herkomst

Fundet fordi sanne-sessionen **afviste** F180's skridt 1 og begrundede det med
tre målinger frem for en indvending. Den tredje — «dette CMS gemmer tal som
strenge» — var ment som et argument mod at lægge en gebyrsats i CMS-indhold. Den
viste sig at være en selvstændig defekt i motoren, bredere end den sag den blev
nævnt i.
