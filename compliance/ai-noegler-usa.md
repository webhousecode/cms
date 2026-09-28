# Nøgler til amerikanske AI-tjenester i drift — hvad bruges de til?

**Målt 28/9-2026** (F201.7, AC 4) ved at læse koden i hver apps repo. De kørende
Fly-secrets er IKKE læst — kun hvilke navne der findes (F201.1). Hvor koden
afhænger af om en anden nøgle findes i drift, står det som «uklart».

## Sender kundedata til USA

| App → tjeneste | Hvad | Hvorfor det er kundedata | Repo |
|---|---|---|---|
| **xrt81 → OpenRouter** | AI-beskrivelse af klubvideoer (Gemma/Gemini); fotos og årsrapport falder tilbage hertil hvis Mistral-nøglen mangler | Videoerne viser medlemmernes ansigter. Koden kalder det selv et åbent compliance-hul | `broberg/xrt81` — `apps/server/src/lib/vision.ts:116-127`, `packages/shared/src/pii-routes.ts:41,71` |

**trail-engine-001 — rettet af trail 28/9, målt i prod:** ingen Anthropic-nøgle i drift; ingest, chat og billeder kører primært på Mistral (EU), 0 tenants har egne nøgler. Lækket var kun SIDSTE nødudvej (gemini-2.5-flash via OpenRouter ved Mistral-nedbrud) — fjernet i trail `b1c72e8` (F290.1), kæden er nu Mistral small → large og fejler synligt. **Live 28/9** på trail-engine-001 (release v259, /api/health ok). `/local-ingest` kompilerer kundekilder i Claude Code (Anthropic, USA) — **Christian 28/9: må fortsætte** («stort set offentligt det hele»).

## Uklart

| App → tjeneste | Hvad | Hvad der mangler for at afgøre det |
|---|---|---|
| cardmem → OpenRouter | Gemini som sidste nødudvej når Mistral fejler (idé-/kort-forslag) | Idéer kan komme fra kundemails (afsender, emne, uddrag). Ikke målt om de når den vej |
| sanneandersen-site → fal.ai | Nyhedsbrevs-illustrationer | Stilmodellen er trænet på Sannes behandlingsbilleder — ukendt om de viser klienter |

## I brug, uden kundedata

| App → tjeneste | Hvad |
|---|---|
| webhouse-whop → Anthropic | Råd om serverkonsolidering (servernavne, priser, antal sites) |
| apple-music-mcp → Anthropic | Vurderer quiz-svar og laver musik-trivia; spillere kendes kun på et forbindelses-id |
| sanneandersen-site → OpenRouter | DeepSeek som nødudvej til nyhedsbrevsudkast (Sannes egen tekst); personhenførbare veje er låst til Mistral |
| webhouse-app → ElevenLabs | Oplæsning af podcast-manuskripter skrevet ud fra publicerede artikler |

## Nøgler koden ikke bruger

| App → tjeneste | Hvorfor den er ubrugt |
|---|---|
| xrt81 → OpenAI | Forbindelsen sættes op, men intet kald peger på OpenAI |
| xrt81 → Anthropic | Indstillingen erklæres og læses aldrig |
| buddy-brain → OpenRouter | Kaldet er mærket EU-only, og EU-vagten afviser alt andet end Mistral |
| buddy-edge-fly → OpenRouter | Kode-review-køen kører ikke på de maskiner |

**Fjernet 28/9 på Christians ord** («Ja, fjern nøglerne»): alle fire, læst tilbage med `flyctl secrets list`; alle tre apps kører igen.

## Ikke undersøgt

`ai-tech-radar` har også en OpenRouter-nøgle (`src/config.js:13`).
