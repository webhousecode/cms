# F202 — Oprettelse sender også indholds-webhook

**Ordre (fejl meldt af ejeren):** Christian 28/9-2026: «https://broberg.ai/flagskibe/mailworker er endnu ikke i trail hvorfor ikke?»

## Målt
- broberg.ai sender en side til Trail via sitets F35-abonnement (`contentWebhooks` → `https://broberg.ai/api/trail-ingest`, broberg-ai-site `src/trail-push.ts`). Opsat og med secret på begge sider.
- `POST /api/cms/<collection>` (opret) kaldte ALDRIG `fireContentEvent`. Kun `PATCH` gjorde. Et dokument oprettet som udgivet i ét kald (sådan agenter opretter sider via API) nåede derfor aldrig webhooken. Mailworker-siden blev oprettet sådan.

## Rettelse (F202.1)
Opret-ruten fyrer `published` når status er published, ellers `created` — samme webhook som PATCH, med aktoren fra sessionen.

## Forsegling
`src/lib/__tests__/create-fires-content-event.test.ts`: publish-opret → ét `published`-event; kladde → ét `created`-event. Rød før rettelsen (ingen events), grøn efter.

## Non-goals
Ingen ændring af broberg-ai-sites trail-push. Mailworker-siden er allerede lagt i Trail manuelt (samme sourceUrl, så et senere push upsert'er).
