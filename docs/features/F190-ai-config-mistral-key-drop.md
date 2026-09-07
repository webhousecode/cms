# F190 — AI-indstillinger taber Mistral-nøglen ved hver gemning

## Hvad er der galt

`POST /api/admin/ai-config` genopbygger hele config-objektet fra en **fast
feltliste**:

```ts
const updated: AiConfig = {
  defaultProvider, anthropicApiKey, openaiApiKey, geminiApiKey,
  webSearchProvider, braveApiKey, tavilyApiKey,
};
await writeAiConfig(updated);
```

`mistralApiKey` står ikke på listen. Den findes overalt ellers:

| Sted | Linje | Kender feltet |
|---|---|---|
| `AiConfig` (typen) | ai-config.ts:8 | ja |
| `AiConfigMasked` | ai-config.ts:21 | ja |
| `maskAiConfig()` | ai-config.ts:95 | ja |
| `getKeyFor("mistral")` | ai-config.ts:124 | ja |
| `getAI()` | ai/client.ts:75 | ja — læser `cfg?.mistralApiKey` |
| **POST-ruten** | api/admin/ai-config/route.ts:27 | **nej** |

## Hvorfor det er alvorligt og ikke kosmetisk

**`defaultProvider` er `"mistral"`** (ai-config.ts:64 og :74 sætter den som
standard). Og hele flådens tekst-tier er Mistral EU. Så feltet der tabes er
nøglen til den udbyder alt tekstarbejde som udgangspunkt kører på.

Konsekvensen for en kunde: en administrator sætter sin Mistral-nøgle, alt
virker. Næste gang nogen gemmer NOGET som helst på AI-siden — skifter
søgeudbyder, indsætter en OpenAI-nøgle — forsvinder Mistral-nøglen tavst.
Siden falder tilbage på `process.env.MISTRAL_API_KEY`, som på en kundes
installation typisk ikke findes. AI-funktionerne holder op med at virke, og
intet i brugerfladen siger hvorfor.

Det fejler i den **grønne** retning: gemningen svarer 200, brugerfladen viser
de maskerede felter, og den tabte nøgle ligner et felt der aldrig blev udfyldt.

## Samme fejlform som config-writeren

Dette er præcis den bug-klasse CLAUDE.md allerede har en hård regel om:
«Rewriting cms.config.ts MUST Preserve ALL Top-Level Fields». Dér tabte
`buildConfigContent()` `locales` og `defaultLocale` på hver skema-redigering,
fordi den havde en hardkodet output-skabelon. Her er det samme mekanik i et
andet objekt — en genopbygger med en fast feltliste, hvor et felt uden for
listen forsvinder.

At reglen findes og fejlen alligevel opstod, siger noget om formen: en
feltliste man skal huske at opdatere ER hullet. Derfor er den vigtigste del af
rettelsen ikke den ene linje der tilføjer `mistralApiKey`, men den prøve der
fejler hvis et felt i `AiConfig` mangler i rutens output. Den fanger det
næste felt uden at nogen skal huske noget.

## Fundet af

Målt 7/9-2026 under F189.7 (podcast-motorens e2e). Manuskript-genereringen
kører på Mistral, og jeg ville sætte nøglen gennem produktets egen skrivevej
frem for at redigere `_data/ai-config.json` direkte. Ruten tog imod kaldet og
kastede feltet væk.

## Rettelse

1. `mistralApiKey: mergeKey(body.mistralApiKey, existing.mistralApiKey)` i
   `updated`-objektet — samme semantik som de øvrige nøgler (tom streng =
   ryd, udeladt = bevar).
2. En prøve der sammenholder `AiConfig`-typens nøgler med de nøgler ruten
   skriver, og fejler ved en manglende. Det er vagten; punkt 1 er blot
   dagens symptom.

## Non-goals

- Ingen omskrivning af hvordan ai-config gemmes (ingen generisk merge over
  ukendte felter — det ville også skrive felter en angriber sender med).
- `webSearchApiKey` (deprecated) røres ikke.
