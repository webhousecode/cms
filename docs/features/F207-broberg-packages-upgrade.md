# F207 — Alle @broberg/*-pakker på seneste udgave

## Motivation

Christian, 3/10-2026: «Opgrader til den seneste udgave af alle vores @broberg/.. npm du anvender» — udløst af components' udgivelsesrapport for @broberg/mail 0.16.0 (vi kørte 0.7.1).

## Stories

- **F207.1** Opgrader alle @broberg/*-afhængigheder i cms-admin, cms-ai og cms-cli til npm latest.

## Scope (F207.1)

| pakke | fra | til | hvor |
|---|---|---|---|
| ai-sdk | 0.49.2 / ^0.41.1 | 0.50.1 | cms-admin / cms-ai |
| chat | 0.6.0 | 0.6.3 | cms-admin |
| cms-chat-client | 0.4.14 | 0.4.20 | cms-admin |
| cms-inline-edit | 0.6.3 | 0.12.0 | cms-admin |
| mail | 0.7.1 | 0.16.0 | cms-admin |
| mail-core | 0.8.0 | 0.9.0 | cms-admin |
| sso | 0.7.0 | 0.8.0 | cms-admin |
| ui-controls-core | 0.2.2 | 0.2.3 | cms-admin |
| lens-engine (peer) | >=0.4.0 | >=0.10.0 | cms-cli |
| consent-cookie, deploy-core | allerede seneste | — | |

Specifikationsstil bevaret: eksakte pins forbliver eksakte, intervaller får hævet bund.

## Non-goals

- At tage nye pakke-features i brug (fx mail/webhook createWebhookAdmin). Kun opgradering.
- Sites i andre repoer.

## Risici læst i README før opgradering

- mail 0.8.0: `getStatus` blev påkrævet på `Mailer`-typen — vi navngiver kun typen som returtype af createMailer, så ingen test-doubles rammes (tsc bekræfter).
- mail 0.14.0: et sprunget send bærer nu `reason` (not-live/disabled/no-key) og `integrity`. Vores live-gate-test brugte streng lighed på `{ok, skipped}` og blev rød — skærpet til at kræve den rigtige `reason`, en stærkere kontrol end før.
- sso 0.8.0: signeret token vinder over userinfo ved uenighed (hærdning; ingen ændring mod BID).

## Rollout

Grøn gate → commit, push, auto-deploy. Rollback = redeploy af forrige image.

## Reuse

Ren opgradering af eksisterende @broberg/*-afhængigheder; ingen ny pakke.
