# F145 — ICD (Instant Content Deployment) — formalization + polish

**Status:** core shipped (retroactive doc), polish + UI surface planned
**Owner:** cms-core
**Priority:** Tier 1 (formaliserer det 3. ben i CMS-deploy-triumviratet — F143 + F144 + F145 = komplet deploy-model)
**Estimat:** core er live i dag; polish ~3-4 dage
**Created:** 2026-05-03
**Søsterplaner:** F142 (Templated SSG), F143 (Static Build Server), F144 (Dynamic Build Orchestrator)

## Hvad er ICD

**Instant Content Deployment** = en HMAC-signeret POST fra cms-admin til et kørende SSR-site's `/api/revalidate`-endpoint, der får sitet til at hente friskt content + bust Next.js cache for de berørte paths. Sub-sekund propagation, **ingen rebuild**.

Det er det 3. og hidtil-udokumenterede ben i CMS-deploy-triumviratet. Et givet site kan bruge én eller flere af de tre, afhængigt af hvad der ændres:

| Edit-type | Hvilken path bruges | Tidshorisont |
|---|---|---|
| Content (blog post, hero-tekst, pris) | **F145 ICD** → /api/revalidate på det allerede-kørende site | Sub-sekund |
| Static-site rebuild (HTML genereres on rocket-tryk) | **F143** → cms-admin builder + pusher til gh-pages/CF Pages | 30 sek - 5 min |
| SSR-site code change (next.config, ny dep, komponent-ændring) | **F144** → ephemeral Fly Machine builder + image swap | 5-10 min |

For et SSR site som sanneandersen-site bruges ICD til **alle daglige content-edits**, og F144 kun når kode/deps ændres. Det er hvorfor 99% af "deploys" på et live SSR site reelt er sub-sekund cache-bust, ikke nye builds.

## Motivation for F-doc nu

ICD-koden er live (`packages/cms-admin/src/lib/revalidation.ts`, `app/api/cms/revalidation/route.ts`, ICD-pill i admin-header) men **ingen plan-doc forklarer arkitekturen som første-klasses pattern**. Konsekvenser:

1. AI/dev sessions der støder på `revalidateUrl`/`revalidateSecret` i registry tror det er en obscur Next.js-detalje, ikke en kerne-deploy-model
2. Bilateralt med F143 + F144 (begge under planlægning) er det utydeligt hvor ICD passer ind — mange spørgsmål "men hvad med ICD" risikerer at blive "rebuild også"-svar selvom ICD allerede løser det
3. Den nyligt-tilføjede `resyncAllContent()` (manuel re-fan-out fra ICD pill) er en undocumented escape hatch
4. Kunder der vil bruge webhouse-CMS'et til deres egen Next.js-site har ingen kanonisk doc at læse

F145 fixer (1)-(4) ved at:
- Beskrive ICD's wire-format (header, payload, HMAC) som spec
- Beskrive routing (computePaths) + collection-kind-aware revalidation
- Definere ICD's plads i triumviratet (hvornår bruger jeg ICD vs F143 vs F144)
- Identificere de polish-områder der mangler (UI surface, secret rotation, retry-logik)

## Det shippede core (retroactive snapshot)

### Site-config fields

I cms-admin's site registry (registry.json):

```json
{
  "id": "sanneandersen",
  "adapter": "filesystem",
  "revalidateUrl": "http://localhost:3021/api/revalidate",
  "revalidateSecret": "<32-char hex secret>",
  "...": "..."
}
```

`revalidateUrl` er nok til at aktivere ICD; `revalidateSecret` er valgfrit men STÆRKT anbefalet (uden secret kan enhver med URL'en triggere uautoriseret revalidation).

### Wire-format

cms-admin's `dispatchRevalidation()` (i `revalidation.ts`) sender:

```http
POST /api/revalidate HTTP/1.1
Content-Type: application/json
X-CMS-Event: content.revalidate
X-CMS-Signature: sha256=<hmac-sha256-of-body-using-revalidateSecret>

{
  "event": "content.revalidate",
  "timestamp": "2026-05-03T01:42:00.000Z",
  "site": "sanneandersen",
  "paths": ["/blog/my-post", "/blog"],
  "collection": "blog",
  "slug": "my-post",
  "action": "published",
  "document": { /* full document JSON for content-push */ }
}
```

Site's endpoint **skal**:
1. Verificere HMAC signature mod `revalidateSecret` shared mellem cms-admin og site
2. Skrive `document` til lokal filesystem (`{contentDir}/{collection}/{slug}.json`) hvis sitet er filesystem-backed
3. Kalde Next.js' `revalidatePath(p)` for hver `path` i payload
4. Returnere 200 OK (alt andet markerer ICD-leveringen som failed i cms-admin's log)

### Action types

`action` field er en af:
- `"created"` — nyt dokument
- `"updated"` — eksisterende dokument ændret
- `"deleted"` — dokument fjernet (sites bør slette filen + revalidate)
- `"published"` — status sat til published
- `"unpublished"` — status sat til draft

### Path computation (computePaths)

cms-admin udleder hvilke URL paths der skal revalidates baseret på:

```ts
function computePaths(collection, slug, urlPrefix?, collectionKind?): string[] {
  const prefix = urlPrefix ?? `/${collection}`;
  const paths = [`${prefix}/${slug}`, prefix];  // detail + index
  if (kind === "global"
      || collection === "pages"
      || slug === "index" || slug === "home" || slug === "homepage") {
    paths.push("/");  // homepage too
  }
  return [...new Set(paths)];
}
```

Eksempler:
- Blog post `posts/my-post` → `["/posts/my-post", "/posts"]`
- Page med slug "home" → `["/pages/home", "/pages", "/"]`
- Site globals update → `["/globals", "/"]`
- Collection med `urlPrefix: "/blog"` → `["/blog/my-post", "/blog"]`

### Auto-trigger på content writes

ICD fyrer automatisk via `content.afterCreate`/`afterUpdate`/`afterDelete` hooks i cms-admin. Brugeren skriver et blogindlæg → cms-admin commit'er JSON til disk → ICD POST sendes umiddelbart efter (ikke-blokkerende). Sites med både filesystem-content og en kørende SSR-instance (f.eks. sanneandersen) får ingen synlig forsinkelse mellem "Save" og "live".

### ICD pill UI (admin-header.tsx)

Når et site har `revalidateUrl` sat:

- **Ingen rebuild-provider configured (deployProvider: 'off')** → vis KUN "ICD · auto" pill (ingen rocket-knap forvirring). Click triggerer `resyncAllContent()` (manuel re-fan-out af alle published docs).
- **Rebuild-provider configured + revalidateUrl** → vis BÅDE rocket OG "ICD · auto" pill. Rocket = fuld rebuild, pill = ad-hoc cache-bust.

### Manual re-sync (resyncAllContent)

`packages/cms-admin/src/lib/deploy-service.ts:101-132` implementerer:

```ts
for (const col of config.collections):
  for (const doc of cms.content.findMany(col.name)):
    dispatchRevalidation(site, {collection, slug, action: "published", document: doc})
```

Use cases:
- Site er nyligt redeployed (volume mounted fresh) — re-seed all content
- ISR-cache er stale af ukendt grund — bust alt
- Site er flyttet til ny URL — re-fanger alle paths under den nye

### Delivery log

Hver ICD-dispatch logges i `{dataDir}/revalidation-log.json` (seneste 50 entries):

```json
[
  {
    "timestamp": "2026-05-03T01:42:00Z",
    "url": "http://localhost:3021/api/revalidate",
    "paths": ["/blog/my-post", "/blog"],
    "collection": "blog",
    "slug": "my-post",
    "action": "published",
    "status": 200,
    "ok": true,
    "durationMs": 47
  },
  ...
]
```

UI surface i Site Settings exists men er begrænset (læses i Settings → Deploys?). Polish-fasen styrker det.

## ICD's plads i deploy-triumviratet (kanon)

```
                    EDIT-TYPE                     PATH                  TID

Content edit                                      F145 ICD              ~50ms
("Save" på blog-post i admin)                     /api/revalidate

Static-site rebuild                               F143                  30s-5min
("Rocket" på filesystem static site)              cms-admin builds      
                                                   → push deploy/ til
                                                   gh-pages / CF Pages

SSR-site code change                              F144                  5-10min
("Rocket" eller GH-push på SSR site)              ephemeral Fly Machine
                                                   builds Docker image
                                                   → flyctl deploy
                                                   --image
```

**Et givet site kan bruge:**
- Kun ICD (rent SSR site, kode deployes via traditional flyctl deploy uden cms-admin's rocket — webhouse-app i dag)
- Kun F143 (rent static site uden runtime — cms-docs)
- Kun F144 (SSR site med kode-deploy via cms-admin men ikke runtime content-fetch — hypotetisk, ikke set i praksis)
- ICD + F143 (static site med både rebuilds OG live revalidate — ovre-konfigureret men teknisk muligt)
- **ICD + F144** (SSR site hvor content er live + kode deployes via cms-admin — sanneandersen efter F144 ships)

ICD + F144 er den fremtidssikrede default for kunder med SSR sites: content edits er instant, kode-changes går gennem den styrede build-pipeline.

## Scope for F145 polish (det der mangler)

### IN-scope

1. **Doc this.** Den her plan-doc + tilhørende AI Builder Guide module (`docs/ai-guide/24-icd.md`) + bilingual docs page på docs.webhouse.app
2. **ICD-status UI** i Site Settings → ny "ICD" sektion: revalidateUrl + revalidateSecret editor (med "Generate new secret" knap), test-button ("Send a test ping"), siste 50 deliveries vist som tabel med filter (ok/failed/specifik path)
3. **Secret rotation flow**: rotér revalidateSecret uden downtime — admin har "Add new secret (keep old active for 24h)" så site kan opdateres in-place og acceptere begge under transition
4. **Retry-logik for failed deliveries**: i dag fejler en ICD silent, logges, men retries ikke. Tilføj exponential backoff (3 retries, 5/30/300 sek) og dead-letter kø for permanente failures
5. **Batched revalidation**: når en bruger gemmer 5 documents på 10 sek (fx via bulk-edit), batch ICD-dispatches per site så vi ikke fyrer 5 separate POST'er. Window: 2 sek
6. **`X-CMS-Idempotency-Key`** header med UUID per dispatch, så receivers kan deduplicate hvis cms-admin retryer samme delivery
7. **Boilerplate `/api/revalidate` route**: ship en kanonisk implementation i `examples/nextjs-boilerplate` + `examples/nextjs-github-boilerplate` så nye SSR sites har den from day one
8. **Auto-set `revalidateUrl` on first deploy**: når en site første gang deployes via F144, cms-admin auto-detect site URL og foreslår at sætte `revalidateUrl: ${siteUrl}/api/revalidate`

### OUT-of-scope (mulig F i fremtiden)

- Multi-region revalidation (hit alle Fly regions samtidigt — ikke nødvendigt før vi har sites i 2+ regioner)
- WebSocket-baseret real-time content stream (alternativ til poll/revalidate — overkill for content-edits)
- ICD til sites uden Next.js (Astro, Hugo, etc. har ingen `revalidatePath()`-equivalent — de skal bruge full rebuild via F143)
- Content-pull model (sites henter fra cms-admin i stedet for cms-admin pushing) — overkill, push-modellen virker

### Non-goals

- Erstatte fuld rebuild for kode-ændringer (F144 er der til det)
- Sikre konsistens mellem cms-admin's content-store og site's content-store under netværkspartition (eventually-consistent acceptabelt; manuel `resyncAllContent` rydder op)

## Arkitektur — receiver-side reference implementation

Sites' `/api/revalidate`-endpoint **skal** følge denne shape (kanonisk eksempel for Next.js):

```ts
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import crypto from "node:crypto";

const CMS_SECRET = process.env.CMS_REVALIDATE_SECRET!;
const CONTENT_DIR = process.env.CONTENT_DIR ?? "./content";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-cms-signature") ?? "";
  const expected = "sha256=" + crypto
    .createHmac("sha256", CMS_SECRET)
    .update(body)
    .digest("hex");

  // timing-safe compare
  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  )) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);
  const { collection, slug, action, document, paths } = payload;

  // 1. Mirror content to local filesystem
  const filePath = join(CONTENT_DIR, collection, `${slug}.json`);
  if (action === "deleted") {
    await fs.unlink(filePath).catch(() => {});
  } else if (document) {
    await fs.mkdir(join(CONTENT_DIR, collection), { recursive: true });
    await writeFile(filePath, JSON.stringify(document, null, 2));
  }

  // 2. Bust Next.js cache for affected paths
  for (const p of paths) {
    revalidatePath(p);
  }

  return Response.json({ ok: true, paths });
}
```

Denne reference shippes som del af F145 polish (Phase 2) i begge nextjs-boilerplates.

## Rollout — 4 phases

### Phase 1 — Documentation (allerede påbegyndt med denne fil) (0.5 dag)
- Denne plan-doc (✓ done at commit-time)
- AI Builder Guide module: `docs/ai-guide/24-icd.md`
- Bilingual docs page: cms-docs/content/docs/icd-instant-content-deployment{,-da}.json
- Update FEATURES.md + ROADMAP.md indexes (samme commit som plan-doc)

### Phase 2 — Boilerplate `/api/revalidate` reference (0.5 dag)
- Tilføj kanonisk receiver til `examples/nextjs-boilerplate` og `examples/nextjs-github-boilerplate`
- Inkluder env-var docs (CMS_REVALIDATE_SECRET, CONTENT_DIR)
- Tests: simuler en ICD POST, verificér mirror + revalidate

### Phase 3 — UI polish (1.5 dag)
- Site Settings → ny "ICD" sektion (revalidateUrl + secret editor + "Send test" + delivery log table)
- Generate new secret knap (cryptographically secure 32-char hex)
- Filter på delivery log (status / path / collection / time range)
- Secret rotation flow ("Add new secret, keep old active for 24h")
- Auto-suggest `revalidateUrl` efter første F144 deploy

### Phase 4 — Reliability (1 dag)
- Exponential backoff retry (5/30/300 sek)
- Dead-letter queue for permanently failed deliveries (UI surface med "Retry now" knap)
- Batched revalidation (2-sek window) for bulk-edit cases
- `X-CMS-Idempotency-Key` header
- Tests: simuler network outage, verificér retry + recovery

## Acceptance criteria

1. **Doc**: et nyt cc-session i et fresh CMS repo kan læse F145-plan-doc + ai-guide module + docs page og opsætte en kunde-Next.js-site med fungerende ICD på under 30 min
2. **Boilerplate**: `npm create @webhouse/cms my-site` + vælg "Next.js" giver en `/api/revalidate` route der virker out-of-the-box mod cms-admin's dispatch
3. **UI**: bruger kan i Site Settings se ICD-status, generate nyt secret, sende test-ping, og se sidste 50 deliveries med filter
4. **Retry**: ICD POST der fejler med 503 retries 3 gange (5/30/300 sek); permanente fejl havner i dead-letter UI
5. **Idempotency**: receiver der ser samme `X-CMS-Idempotency-Key` to gange kan vælge at no-op den anden (reference impl viser hvordan)
6. **Triumvirat-kanonisk**: dokumentationen identificerer eksplicit at ICD + F143 + F144 er **ikke-overlappende** paths, og giver klare regler for hvilken bruges hvornår

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| Site mister ICD-secret → kan ikke verificere signatures | Lav | Secret rotation flow (Phase 3); fallback: bruger genererer nyt secret + opdaterer site env-var |
| ICD-receiver glemmer signature-verifikation → uautoriseret revalidation | Mellem | Boilerplate ships med korrekt impl; AI guide siger eksplicit "verify first, write later"; security-scan rule der detekterer ICD-routes uden signature check |
| Network partition mellem cms-admin og site → silent dropped revalidations | Mellem | Phase 4 retry + dead-letter; manual `resyncAllContent` til recovery |
| Bulk-edit fyrer 50 ICD-dispatches på 5 sek → site overloaded | Lav-mellem | Phase 4 batching (2-sek window); receiver kan også rate-limit |
| ICD og F144 race condition: kode-deploy mid-revalidation = inconsistent state | Lav | F144's rolling restart håndterer in-flight ICD-requests via Fly's connection drain (eksisterende behavior) |
| Receiver implementation lækker secret via stack-trace | Mellem | Boilerplate ships med try/catch og generisk 401-response; aldrig log secret eller signature i prod |

## Hvorfor F145 sammen med F142+F143+F144

Det er nu de fire deploy-features kan beskrives som ét coherent picture:

- **F145 (ICD)** — content propagation til kørende SSR sites (allerede shipped, kun polish)
- **F143 (Common Build Server)** — static site rebuilds inden for cms-admin (4-6 dage)
- **F144 (Dynamic Build Orchestrator)** — SSR site rebuilds via ephemeral Fly Machines (4-6 dage)
- **F142 (Templated SSG)** — alternativ til build.ts for static sites (7-10 dage)

Med alle fire har CMS'et et **komplet svar** på "hvordan kommer mit site live": vælg site-type, vælg build-strategi, vælg content-update-strategi. Ingen flere "men hvad med X"-spørgsmål.

## Relateret

- F36 (Framework Integrations) — beskriver hvordan sites integrerer med cms-admin generelt; ICD er en del af det
- F41 (GitHub Site Sync) — alternativ til ICD for sites bagged af GitHub-adapter (commit content til repo, GH webhook fyrer rebuild)
- F143/F144 — søsterplaner i build-orchestration triumvirat
- 2026-05-02 trail-landing incident — bekræftede behovet for at formalisere alle 3 deploy-paths så cc sessions ikke gætter
