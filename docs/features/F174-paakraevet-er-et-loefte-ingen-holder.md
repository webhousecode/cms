# F174 — "Påkrævet" i et skema er et løfte ingen holder

**Status:** backlog — venter på Christians ord, se **Beslutningen** nedenfor
**Anledning:** sanne-sessionen, intercom #22931, 27. august 2026

---

## Fundet

De POST'ede et dokument til `undervisere` **helt uden** `name`, som skemaet
mærker `required: true`. Svaret var **201**. Rækken blev skrevet.

Efterprøvet i vores egen kildekode frem for taget for gode varer:

| skrive-vej | håndhæver `required`? |
|---|---|
| `/api/forms/[name]` (formular-indsendelser) | **ja** — serverside, felt for felt |
| `/api/cms/[collection]` (indhold) | **nej** — ingen steder |

```ts
// forms/[name]/route.ts:110
if (field.required && (val === undefined || val === null || val === "")) {
  errors.push(`${field.label || field.name} is required`);
}
```

Den kontrol findes. Den blev skrevet til formularer og nåede aldrig indhold.
**Fjerde gang på to dage** vi rammer den form i dette repo: instansen lukket,
klassen stående (SEO/model-pickeren, origin-hjælperen på ét af fire
kaldesteder, skema-læsningen i F173, og nu denne).

## Hvorfor det ikke bare er kosmetik

Dokumentationen lover det som en rigtig begrænsning. `docs/ai-guide/` bruger
`required: true` gennemgående, og `21-framework-consumers.md` fører feltets
`required`-flag op som en del af den eksporterede kontrakt ikke-TS-forbrugere
(Java, .NET, PHP, Python, Ruby, Go) læser via `webhouse-schema.json`.

En forbruger der stoler på den kontrakt, får ikke en advarsel — den får et
dokument uden feltet og opdager det når noget render tomt.

Admin-UI'et sætter en `*` ved feltet. Det er en høflighed, ikke en sprærre; der
er heller ingen klient-validering der blokerer.

Hos sanneandersen er skaden begrænset — deres render filtrerer på et ikke-tomt
navn, så en navnløs række giver ingen boks frem for en tom én. Det er deres
omhu, ikke vores sprærre.

## Beslutningen der ikke er min

At slå håndhævelse til betyder at **skrivninger der i dag lykkes, begynder at
fejle** — på tværs af hver eneste kunde-site, og på hver skrive-vej: AI-agenter,
SEO-bulk, ICD-push, inline-edit, MCP-værktøjer, import.

Der findes næsten helt sikkert eksisterende dokumenter der ikke opfylder deres
eget skema. Dem skal der måles på før noget slås til — ikke gettes på.

Tre veje, og valget er Christians fordi det kan brække kunde-sites:

| | hvad der sker | pris |
|---|---|---|
| **A. Håndhæv** | POST/PATCH afvises med 400 når et påkrævet felt mangler | kan brække kørende skrive-veje på dagen |
| **B. Advar** | skrivningen går igennem, men svaret bærer en advarsel og det logges | ingen bryder sammen; løftet er stadig ikke holdt |
| **C. Skriv sandheden** | dokumentér at `required` kun er en UI-markering | ærligt, gratis — men så er feltet værdiløst som kontrakt |

Min hældning: **B først, mål hvem der overtræder, DEREFTER A** — så vi ved hvad
vi brækker før vi brækker det. C alene er at give op på et felt vi selv har
skrevet ind i en kontrakt for eksterne forbrugere.

## Første skridt, uanset valg

MÅL først: hvor mange eksisterende dokumenter på tværs af alle sites mangler
et felt deres eget skema kalder påkrævet? Uden det tal er enhver af de tre
veje et gæt. Det er en ren læsning og kan køres uden at røre noget.

## Risiko ved at lade den ligge

Lav i dag, stigende. Hver nyt site der skrives med `required` i skemaet, tror
det er en sprærre. Den dag et felt faktisk er bærende — en pris, et
CVR-nummer, en samtykke-version — er det en tavs løgn i skemaet.
