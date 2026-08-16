# F165 — Opsætnings-cachen skal selv opdage ændringer

**Status:** i gang · **Ejer:** cms · **Fil:** `packages/cms-admin/src/lib/site-pool.ts`

## Motivation — den konkrete hændelse

2026-08-16 bad Christian om en rigtig WYSIWYG-editor på sanneandersens sektions-tekst (`sider-content.sections[].body`, `textarea` → `richtext`). Ændringen var allerede lavet. Alligevel så han et almindeligt tekstfelt.

Tre målinger, i rækkefølge:

| Kilde | Svar |
|---|---|
| Filen på volumenen (`cms.config.ts`, linje 356) | `richtext` |
| `GET /api/schema?site=sanneandersen` | `richtext` |
| Selve redigeringsskærmen (Lens) | **`<textarea>`** — kun ÉN rich-text-editor på hele siden |

Den dokumenterede cache-rydning (`POST /api/cms/registry` `update-site` → `invalidate()`) ændrede intet. Først et deploy — altså en genstart af processen — fik editoren frem. Efter deployet: to rich-text-editorer, og den der indeholder CV-teksten ER en ProseMirror.

## Root cause

`getOrCreateInstance()` i `site-pool.ts`:

```ts
if (pool.has(key)) {
  if (process.env.NODE_ENV === "production") return pool.get(key)!;   // ← for evigt
  ...TTL i dev...
}
```

I produktion returneres den cachede, kompilerede `CmsConfig` **uden nogen udløbsdato og uden noget signal om at filen på disken er ændret**. Kommentaren på `invalidateActiveSite()` erkender det allerede: "the site-pool cache lives forever in prod, so any code that writes to cms.config.ts on disk MUST call this".

Den kontrakt kan ikke holde, af to grunde:

1. **Next.js kører middleware, route-handlers og server-komponenter som SEPARATE modul-instanser med hver sin `pool`.** En `invalidate()` i én instans rydder ikke de andre. Det var præcis hvad vi målte: skema-API'et (route-handler) svarede friskt, mens redigeringssiden (server-komponent) sad med den gamle.
2. **Filen ændres også UDEN FOR appen** — et beam/ICD-push, en `flyctl ssh`-reparation, en anden proces. Der findes ingen `invalidate()`-kald at glemme; der er ingen kalder overhovedet.

Dette er nøjagtig den fejltype repoets egen CLAUDE.md forbyder ("Module-Level Caches Must Self-Invalidate"), og som allerede blev lukket ÉT sted: `loadRegistry()` stat'er `registry.json` og genindlæser når mtime ændrer sig (broberg-ai-hændelsen 2026-06-25, forseglet af `site-registry-cache.test.ts`). **site-pool fik aldrig samme behandling.**

## Løsning

Samme mønster som `loadRegistry()` — bevidst, så der er ét mønster i huset frem for to:

- Gem instansens `configMtimeMs` ved siden af den cachede `CmsInstance`.
- I produktion (filsystem-adapter): `fs.stat` på den absolutte `configPath` ved hvert opslag. Uændret mtime → cache. Ændret → genopbyg.
- `stat` FØR indlæsning, så et skriv midt i en indlæsning højst koster én overflødig genopbygning — aldrig en permanent forældet cache.
- Fejler `stat` (filen kortvarigt væk under et skriv) → behold sidste gode kopi frem for at kaste.
- **GitHub-adapteren røres ikke**: der er ingen lokal fil at stat'e, og den har allerede sin egen TTL.
- Dev-TTL'en røres ikke.

En `fs.stat` pr. opslag er samme pris som registry-rettelsen allerede betaler.

## Non-goals

- At fjerne `invalidate()`/`invalidateActiveSite()`. De bliver hurtigere end en mtime-runde for den instans der selv skrev, og de er stadig rigtige. Dette er sikkerhedsnettet under dem.
- Delt cache mellem instanser (Redis o.l.). Filen ER det delte signal.
- GitHub-adapterens caching.

## Reuse (F217)

Intet delt `@broberg/*` dækker konfigurations-caching — og genbrugen her er intern og vigtigere: **samme mtime-mønster som `site-registry.ts` allerede bruger**, så en fremtidig læser møder ét mønster, ikke to konkurrerende.

## Risici

- **Stat pr. request**: målt billigt i registry-rettelsen; samme størrelsesorden.
- **Netværks-filsystem med grov mtime-opløsning**: Fly-volumen er lokal disk, ikke NFS. Ikke en reel risiko her.
- **Uændret mtime ved ændret indhold** (fx en gendannelse der bevarer mtime): sjældent, og `invalidate()` dækker den kendte skrive-vej.

## Rollout

1. Rød test der beviser at en ændret `cms.config.ts` ikke opdages i dag.
2. Implementering.
3. Grøn + mutations-tjek.
4. Deploy — og derefter er dette den SIDSTE gang et skema-skifte kræver et deploy.
