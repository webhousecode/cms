# F209 — Sårbare pakker

**Ordre:** Christian 13/10-2026 «ret sårbarhederne i pakkerne».

## Målt (pnpm audit, 13/10)
3 critical · 80 high · 98 moderate · 16 low. Security Gate's «Dependency Audit» fejler på critical og har været rød på mindst de seneste 5 commits. Den blokerer ikke deploy.

| Critical | Via | Fix |
|---|---|---|
| proxy-addr 2.0.7 (IP-spoofing) | @modelcontextprotocol/sdk → express | ≥2.0.8 |
| @capacitor/ios + android 8.3.0 (fjernindhold på app-origin) | cms-mobile | ≥8.3.5 (seneste 8.5.3) |

High: ~40 forskellige pakker, næsten alle transitive (MCP SDK, firebase-admin, mammoth/xmldom, archiver, shadcn, gray-matter, knip, tiptap, next/sharp, drizzle-orm, hono, nanoid, vite/postcss i mobile).

## Fremgang
1. Opgradér direkte afhængigheder inden for samme major, hvor fix findes (MCP SDK, drizzle-orm, hono, sharp, tiptap/prosemirror, capacitor, firebase-admin, mammoth, next).
2. `pnpm.overrides` for transitive pakker, KUN inden for den major forbrugeren allerede bruger (fx `@xmldom/xmldom`, `fast-uri`, `brace-expansion`, `js-yaml`, `protobufjs`, `proxy-addr`).
3. Ingen major-spring i denne runde — et major-spring er en arkitekturbeslutning (CLAUDE.md).
4. Gate: tsc, cms + cms-admin vitest, `next build` for cms-admin, og pnpm audit uden critical.

## Resultat (F209.1, 13/10)
Før: 3 critical · 80 high · 98 moderate · 16 low.
Efter: **0 critical · 2 high** · 21 moderate · 6 low.

Opnået med `pnpm update -r` inden for eksisterende versionsintervaller (opdaterer også transitive pakker), plus to bevidste 0.x-spring som tests dækker: `drizzle-orm` 0.38 → 0.45 (SQL-injection via identifikatorer; sqlite-adapterens tests grønne) og `sharp` 0.34 → 0.35 (Node ≥20.9, Docker kører 22). `@capacitor/*` 8.3.0 → 8.5.x lukkede de to critical i mobil-appen.

Tre `@broberg/*`-intervaller som `pnpm update` snævrede (`>=x <1` → `^x`) er sat tilbage.

## Kendte rester
| Pakke | Via | Hvorfor ikke rettet |
|---|---|---|
| `vite` 5.4 (high) | cms-mobile (byggeværktøj, sendes ikke med appen) | Fix kræver vite 6 — major-spring, egen beslutning |
| `braces` 3.0.3 (high) | knip (udviklerværktøj) | Ingen rettet version udgivet |

`node-forge` forsvandt med opdateringen af firebase-admin's afhængigheder.

## Non-goals
Moderate/low tages kun hvis de falder med de samme opgraderinger. Ingen major-opgraderinger.

## Reuse
Intet nyt.
