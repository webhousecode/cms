# F161 — cms-admin: hærdning & polish

> Umbrella for en batch af fokuserede cms-admin-forbedringer identificeret 2026-07-11 i en advisor-gennemgang. Fire uafhængige stories, hver med egen plan-doc + AC.

## Motivation

cms-admins backlog er tynd (1 uhandlet idé, resten carded). En kort advisor-gennemgang fandt fire konkrete, høj-signal forbedringer på tværs af i18n-UX, cache-kohærens, chat-UX og oprydning. De er uafhængige, men grupperes her som én batch for overblik.

## Stories

- **F161.1 — Re-oversæt-handling** for opdateret kilde-indhold (i18n UX-gap fra cms-inbox-idé 2026-06-07).
- **F161.2 — Schema-edits surfacer uden machine-restart** (kompileret-config/site-pool cache-kohærens mellem middleware + route-handlers).
- **F161.3 — Delt designet capabilities-renderer** i `@broberg/cms-chat-client` (momentum fra broberg-capabilities-panelet 2026-07-11).
- **F161.4 — Dead-code sweep** via `scripts/code-audit.sh`.

## Non-goals

- F152 (multi-machine / Turso HA) — separat, større strukturelt spor.
- config-writer AST-rewrite — noteret som fremtidig hærdning, ikke i denne batch.

## Rollout

Hver story leveres + verificeres uafhængigt (typecheck + test + Lens hvor UI berøres). Eneste indbyrdes afhængighed: F161.3 bygger på F158.2-pakken (`@broberg/cms-chat-client`) + F160.1 (OIDC-publish).
