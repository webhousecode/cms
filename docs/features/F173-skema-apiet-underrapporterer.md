# F173 — Skema-API'et rapporterer en samling som mindre end den er

**Status:** i gang
**Anledning:** fundet 27. august 2026 under en skema-synk til sanneandersen (sanne-sessionens F080)

---

## Hvad der skete

Christian: "Sanne mangler en content type i sit site." sanne-sessionen kunne
ikke selv skrive den (deres service-token er ikke admin, og `schemaEditEnabled`
er slukket på sitet), så vi synkede den herfra.

Skrivningen gik godt. `POST /api/schema/collections` svarede `201 {"ok":true}`.

Den læsning der skulle bekræfte det, gjorde noget andet:

| | i filen på maskinen | i `GET /api/schema` |
|---|---|---|
| `name`, `label`, `fields` | ✓ | ✓ |
| `kind: "data"` | ✓ | **mangler** |
| `sourceLocale: "da"` | ✓ | **mangler** |
| `description` (Sannes hjælpetekst) | ✓ | **mangler** |

## Hvorfor

```ts
const collections = config.collections.map((col) => ({
  name: col.name,
  label: col.label,
  urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
  fields: col.fields,
}));
```

Fire egenskaber, håndplukket. Alt andet forsvinder tavst — også `previewable`,
`urlPattern`, `nested`, `defaultSort`, og enhver egenskab en fremtidig samling
får. Ruten kan ikke sige "det ved jeg ikke"; den svarer som om samlingen ikke
havde mere.

## To ting værd at holde fast i

**Jeg konkluderede først forkert.** Jeg så de manglende felter i API-svaret og
skrev at config-writeren havde tabt dem — den kendte, dokumenterede fejlklasse
på præcis denne kodesti (CLAUDE.md, maj-hændelsen hvor `locales` forsvandt på
dette site). Først da jeg læste den rå fil, viste det sig at være læsningen.
**Et manglende felt i et svar fortæller ikke hvem der tabte det.**

**Samme fil havde allerede lært lektien — på den anden side.** POST-ruten bærer:

```ts
// Keep existing collections as full objects (no prop reduction) so the
// writer can't drop urlPattern/previewable/nested fields on a sibling.
```

Skrive-siden blev rettet; læse-siden fik den aldrig. Tredje gang på to dage vi
rammer den form: instansen lukket, klassen stående (SEO/model-pickeren,
origin-hjælperen der kun nåede ét af fire kaldesteder, og nu denne). En
rettelse der findes men ikke er nået rundt, ligner mest af alt en der virker.

## Hvem det rammer

Enhver der verificerer et skema over API'et frem for ved at læse en fil på en
Fly-maskine: peer-sessioner (sanne, i dag, direkte), ikke-TS-forbrugere, og alt
der bygger på `webhouse-schema.json`-kontrakten.

For Sanne selv er skaden begrænset — admin-UI'et læser konfigurationen direkte,
ikke gennem denne rute — men hendes hjælpetekst er usynlig for alt andet der
spørger systemet hvad samlingen er.

## Hvad der bygges (F173.1)

Returnér samlingen hel. Én linje mindre kode end den håndplukkede liste.

**Prøven skal bruge en egenskab ruten ALDRIG har kendt til**, ikke en af de tre
der manglede i dag. Ellers følger prøven bare med næste allowlist, og vi har
bygget en test der beviser at listen har fire punkter frem for at samlingen er
hel.

## Ikke i scope

De øvrige skema-ruter (`/api/schema/[collection]`, `/collections`, `/sync`).
De skal læses efter samme mønster, men hver sin rute og hver sin kontrakt —
og at slå dem sammen her ville skjule hvad der faktisk blev målt i dag.

## Risiko

| Hvad | Hvor slemt | Forsvar |
|---|---|---|
| En intern sti eller hemmelighed følger med ud i svaret | høj | Prøve der afviser filsystemstier og nøgler i svaret — målt, ikke antaget |
| Adgangskontrollen ændres utilsigtet | høj | Gaten røres ikke; test i begge retninger |
| En forbruger brækker af FLERE felter | lav | Additivt; ingen kendt forbruger afviser ukendte nøgler |
