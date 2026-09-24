# F200 — Fly-kald går gennem @broberg/deploy-core

**Status:** in progress · **Ordre:** Christian 24/9-2026 («tag Fly-pakken nu»)

## Motivation

cms-admin har to egne Fly-klienter:

- `packages/cms-admin/src/lib/build-orchestrator/fly-machines.ts` (F144 SSR-builder-VM)
- `packages/cms-admin/src/lib/deploy/fly-machines.ts` (F119 deploy-wizard, `docker-stream`-ruten)

components udgav `FlyClient` i `@broberg/deploy-core` 0.4.0 (rettet til 0.4.1: tidsgrænse pr. kald) og målte to fejl i vores kode, som vi har bekræftet ved at læse den:

1. `awaitBuilderCompletion` genforsøger på ALLE `!res.ok` — også 401/404 — i op til 30 minutter. En forkert token ligner et langsomt build.
2. `success = state !== "failed" && (exitCode === null || exitCode === 0)` — en maskine der stopper UDEN exit-kode tælles som succes.

Også i deploy-wizard-klienten: `getApp()` sluger ALLE fejl og svarer `null`, så en forkert token/netværksfejl får wizarden til at forsøge at OPRETTE appen; og ingen kald har tidsgrænse.

## Scope

- Tilføj `@broberg/deploy-core` exact-pin `0.4.1` til cms-admin.
- Build-orchestrator: `spawnBuilder` → `FlyClient.createMachine`; `awaitBuilderCompletion` → `FlyClient.waitForExit`. Succes kræver `exitCode === 0` (null = ingen dom = ikke succes). Permanent HTTP-fejl kaster straks; timeout → `finalState: "timeout"`.
- Deploy-wizard: `FlyMachinesClient`-klassen fjernes; `docker-stream`-ruten bruger `FlyClient` direkte (listOrgs, getApp, createApp, setSecrets, createMachine, waitForState, allocateIp). `FLY_REGIONS`/`FLY_VM_SIZES` bliver i filen (bruges af en klient-komponent).

## Non-goals

- `streamBuilderLogs` bliver lokal — pakken har den ikke (components har ikke verificeret `/logs`-endpointet).
- Ingen ændring af deploy-flowets trin, UI eller tekster.
- `run-fly-ephemeral` og andre flyctl-baserede stier røres ikke.

## Arkitektur

Én klient for hele flåden; fejlrettelser sker ét sted (components). Vi beholder vores egne funktionssignaturer (`spawnBuilder`, `awaitBuilderCompletion`, `runBuilderEndToEnd`) så orchestratoren er urørt.

## Reuse

`@broberg/deploy-core` FlyClient (components-pakke). Ingen ny kode bygges for noget pakken ejer.

## Risiko

- Builder-maskiner med `auto_destroy` → state `destroyed`; hvis Fly ikke registrerer exit-event, meldes buildet nu FEJLET frem for succes. Det er den korrekte retning (en tavs succes er værre), men kan give et falsk rødt build. Mål i drift.
- Tests i `lib/__tests__/fly-machines.test.ts` stubber global fetch — FlyClient bruger global fetch som default, så de virker fortsat, men forventninger opdateres.

## Rollout

Grøn gate (tsc + vitest) → commit, push → auto-deploy via CI.
