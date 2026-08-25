# F170 — Et gem der svarer "gemt" om et felt det ikke gemmer

**Status:** backlog · **Fundet:** 25. august 2026, under F169.2 (domæneflippet)

## Hvad der skete

Jeg ville flytte sitets revalidate-adresse fra staging til det nye domæne:

```
POST /api/cms/registry  {action:"update-site", updates:{revalidateUrl:"https://www.webhouse.dk/api/revalidate"}}
→ 200  {"ok":true, "site":{…}}
```

Svaret var grønt. Værdien var uændret — både i svaret og ved en frisk læsning bagefter.

Årsagen står i `updateSite()` i `lib/site-registry.ts`: funktionen har en hvidliste over felter den overhovedet kan skrive (`name`, `previewUrl`, `homepageSlug`, `homepageCollection`, `configPath`, `contentDir`, `uploadDir`). `revalidateUrl` er ikke på den. Et felt uden for listen falder på gulvet uden en lyd, og ruten svarer `ok: true` bagefter, fordi den kun spørger om funktionen fandt sitet — ikke om den skrev noget.

## Hvorfor det er værd at rette

Det er præcis den fejlklasse husreglen er skrevet imod: en formular der siger «Gemt» over et gem der ikke skete. Her er der ikke engang en formular — der er en API-kontrakt, og den lyver mod ENHVER kalder: admin-UI'et, en cc-session, et script, en fremtidig integration. Man kan ikke skelne «feltet blev gemt» fra «feltet findes ikke» ud fra svaret.

Det farlige er ikke det tabte felt. Det er at kaldet var **umuligt at afsløre uden en genlæsning**. Jeg fangede det kun fordi jeg læste tilbage; havde jeg stolet på `ok:true`, ville registret have stået med staging-adressen, og den næste der undersøgte sagen ville have set et grønt svar i loggen og ledt et forkert sted.

## Retning (ikke låst)

To mulige svar, og de udelukker ikke hinanden:

1. **Afvis det ukendte.** Et felt uden for hvidlisten giver 400 med navnet på feltet. Kalderen får at vide at den bad om noget der ikke findes — i stedet for at tro den lykkedes.
2. **Udvid hvidlisten** med de felter der reelt hører til et site (`revalidateUrl`, `revalidateSecret`, …), så det legitime kald virker.

(1) er den vigtige. Uden den vender problemet tilbage næste gang nogen tilføjer et felt til `SiteEntry` og glemmer skrive-grenen — og så er vi det samme sted, bare med et andet feltnavn.

## Åbne spørgsmål

- Er der andre skrive-ruter i cms-admin med samme form — en hvidliste i implementeringen og et `ok:true` i ruten? `updateOrg` ser umiddelbart ud til at have samme mønster. Et sweep hører til i denne epic.
