# F164 — Links i inline-editoren (fri URL eller levende sidehenvisning)

**Status:** planlagt · **Ejer:** cms · **Pakke:** `@broberg/cms-inline-edit`

## Motivation

Inline-editorens værktøjslinje kan i dag fed/kursiv/understreget, punktliste, nummereret liste, farve og emoji — men **ikke indsætte et link**. En redaktør der vil henvise til en anden side på sitet skal bede en udvikler, eller skrive rå markdown et andet sted.

Christian, ordret (2026-08-16):

> "du skal kunne indsætte et link og det skal både kunne være en fri URL ELLER en rigtig side fra sitet så hvis referencen ændres eller skifter titel eller hierarkisk placering så opdateres linket automatisk."

Det andet halve er det egentlige krav. Interne links rådner: en side flyttes eller omdøbes, og tyve links rundt på sitet peger nu et forkert sted — opdaget først når en kunde klikker. Løsningen er at gemme **hvilken side** der linkes til, ikke **hvilken adresse** den tilfældigvis har i dag.

## Designvalg (truffet af Christian, ikke antaget)

1. **Levende henvisning** frem for "ret alle links når en side flyttes". Vi gemmer en henvisning; sitet slår den op ved visning. Ingen efterfølgende omskrivning af gemt indhold — en omskrivning der fejler halvvejs efterlader døde links, og den kan ikke følge titelændringer.
2. **Linkteksten følger sidens titel, men kan overskrives.** Vælger redaktøren bare en side, vises altid den aktuelle titel. Skriver redaktøren sin egen tekst, vinder den og bliver stående.

## Scope

### I scope

- **Link-knap i inline-værktøjslinjen** med custom dialog (aldrig `window.prompt` — husregel).
- **To linktyper i samme dialog:** fri URL, eller søg-og-vælg en side på sitet.
- **Levende opløsning ved visning:** href + (valgfrit) tekst hentes fra dokumentets aktuelle tilstand.
- **Fjern/redigér link** på et eksisterende link.
- **Adoption på broberg.ai og sanneandersen.dk.**

### Non-goals (v1)

- Links til overskrifter/ankre inde på en side.
- Fil-/medie-links (håndteres af medie-fløjen).
- Et "hvilke sider linker hertil"-overblik i admin.
- Automatiske redirects for flyttede sider (levende henvisning gør dem unødvendige for VORES links, men ikke for eksterne indgående links).
- Links i felter der ikke er richtext.

## Arkitektur

### Lagringsformat — rigtig URL nu, henvisning ved siden af

cms `richtext`-felter gemmer **Markdown**, som forbrugeren render'er med `marked`. Markdown har ingen plads til metadata på et link, så en sidehenvisning gemmes som **inline HTML** — hvilket `marked` sender ufølsomt igennem, og som vores egen serializer allerede bruger til formatering uden markdown-ækvivalent:

```html
<a href="/da/om-sanne" data-cms-ref="sider-content:om-sanne" data-cms-ref-label="auto">Om Sanne</a>
```

- `href` er **altid en ægte, virkende adresse** — skrevet på gemme-tidspunktet. Det er bevidst: et site der aldrig adopterer opløseren får stadig links der virker, de opdaterer sig bare ikke selv. Ingen `cms:`-protokol der lander som dødt link hos en slutbruger (ship-dark).
- `data-cms-ref` er henvisningen (`collection:slug`).
- `data-cms-ref-label="auto"` betyder "vis sidens aktuelle titel"; mangler attributten, er teksten redaktørens egen og røres ikke.
- En fri URL gemmes som helt almindeligt markdown-link — uden data-attributter, uden opløsning.

### Opløsning ved visning

En ny hjælper i pakkens eksisterende `/server`-indgang:

```ts
resolveCmsLinks(html, lookup)  // lookup: (collection, slug) => { url, title } | null
```

Forbrugeren kalder den på render-tidspunktet. Ukendt henvisning (slettet side) → lad `href` stå som den er og log — aldrig et tomt link, aldrig et kast der vælter siden.

### Serializer — kritisk detalje

`serializeInline()` konverterer i dag `<a>` til markdown `[tekst](href)`, hvilket **ville smide data-attributterne væk ved første gem**. Et `<a>` med `data-cms-ref` skal derfor serialiseres som inline HTML i stedet. Uden dette overlever en henvisning ikke sin første redigering. Testes eksplicit.

### Side-vælgeren

Dialogen skal kunne søge blandt sitets sider. Kræver et endpoint på webhouse.app der lister linkbare dokumenter (collection, slug, titel, url) for et site, autentificeret med den eksisterende edit-session-token — altså skal token-allowlisten i `proxy.ts` udvides med netop det ene GET-endpoint.

## Afhængigheder

- `@broberg/cms-inline-edit` (vores egen).
- Nyt GET-endpoint på webhouse.app + udvidelse af edit-session-allowlisten i `proxy.ts`.
- Adoption kræver en ny pakkeversion hos broberg og sanne.

## Reuse (F217)

Discovery gennemsøgt 2026-08-16 for `link`, `reference`, `richtext editor`. **Ingen delt `@broberg/*`-pakke dækker link-indsættelse eller reference-opløsning** — træffene var auth/mail/mcp/media/ai-sdk. Bygges derfor i `@broberg/cms-inline-edit`, som i forvejen ER flådens delte pakke for netop denne kapabilitet. Opløseren lægges i pakkens `/server`-indgang så ethvert forbrugersite får den uden at kopiere kode.

## Risici

- **Serializer-tab** (se ovenfor) — største risiko; en henvisning der ikke overlever gem er værre end ingen funktion. Rød test først.
- **Inline HTML i markdown**: allerede etableret praksis i pakken, men øger mængden af HTML i gemt indhold.
- **Site uden opløser**: degraderer til et almindeligt virkende link. Bevidst valgt.

## Rollout

1. Serializer bevarer `data-cms-ref` (rød test → grøn).
2. Endpoint + allowlist på webhouse.app.
3. Link-knap + dialog i værktøjslinjen.
4. `resolveCmsLinks()` i `/server`.
5. Adoption: broberg.ai først (første-parts), derefter sanneandersen.dk.
