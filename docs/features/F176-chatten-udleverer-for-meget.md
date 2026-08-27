# F176 — Chatten udleverer 30 muterende værktøjer til en læser

**Status:** i gang · **kritisk**
**Anledning:** components' research-spørgsmål #22973, 27. august 2026

---

## Målt, ikke læst

`buildChatTools(perms)` kørt med en **viewers** faktiske rettigheder
(`content.read`, `forms.read`, `media.read`):

```
61 værktøjer udleveret, heraf 30 MUTERENDE:
create_document, update_document, publish_document, unpublish_document,
build_site, trash_document, run_agent, approve_queue_item, reject_queue_item,
trigger_deploy, trigger_build, clone_document, restore_from_trash,
run_link_check, bulk_publish, bulk_update, schedule_publish,
translate_document, translate_site, run_lighthouse, add_memory,
forget_memory, create_workflow, run_workflow, delete_workflow,
create_agent_from_template, save_agent_as_template, set_agent_budget,
set_agent_locale, enable_image_generation
```

## Tre fejl der forstærker hinanden

**1. Filteret slipper alt igennem der ikke siger fra.**

```ts
// tools.ts:124
return allTools.filter((t) => !t.permission || hasPermission(perms, t.permission));
```

`!t.permission` → **behold**. Af 64 værktøjer bærer **4** et `permission`-felt
(`update_site_settings`, `create_agent`, `empty_trash`, `create_backup`). De
øvrige 60 er dermed usynlige for porten. Standarden er ÅBEN, og det er den
forkerte vej for en gate.

**2. Ruten spørger ikke om man må chatte.**

```ts
// api/cms/chat/route.ts:24
const session = await getSessionWithSiteRole();
if (!session) return 403;
```

Det er hele adgangskontrollen. Ingen `requirePermission("chat.use")`, ingen
`denyViewers()`, og ingen rolle-gate i proxy'en på denne sti. `chat.use` **findes**
som rettighed og ligger på editor-listen — den bliver bare aldrig spørgt om.

**3. Rollen falder tilbage til admin.**

```ts
// route.ts:54
resolvePermissions((session.siteRole ?? "admin") as UserRole)
```

Mangler `siteRole`, bliver man **administrator**. Et fail-open default i netop
den linje der afgør hvad man får udleveret.

## Hvorfor rute-portene ikke redder os

Handlerne kalder `getAdminCms()` **direkte** — ikke vores egne HTTP-ruter. Al den
`requirePermission`-håndhævelse der ligger på `/api/cms/*` er derfor **ikke i
vejen**. Chatten er sin egen skrive-vej ved siden af den sikrede.

Det er **femte** gang på to dage vi rammer den form: reglen findes, og den er
ikke nået hele vejen rundt. De fire første er SEO/model-pickeren,
origin-hjælperen på ét af fire kaldesteder, skema-læsningen (F173) og `required`
på indhold (F174). Repoets egen CLAUDE.md siger det ordret: *"Chat tool → Add
`permission: "foo.bar"` to the tool definition object"*. Reglen er skrevet ned og
efterlevet 4 gange ud af 64.

## Hvad der bygges

1. **Vend standarden.** Et værktøj uden `permission` er **udelukket**, ikke
   inkluderet. Det gør glemsel til en lukket dør frem for en åben.
2. **Giv de 60 deres rettighed.** De fleste falder på plads i det editorer
   allerede har (`content.create`, `content.edit`, `content.publish`,
   `content.delete`, `deploy.trigger`, `agents.run`).
3. **Gaté ruten på `chat.use`.** Rettigheden findes; den skal bare bruges.
4. **Fjern admin-fallbacket.** Ingen rolle ⇒ ingen rettigheder.

## Hvad der IKKE ændres

En editors chat skal virke præcis som før — det er den negative kontrol. Bliver
editor-oplevelsen dårligere, er rettelsen for hård. En viewer mister chatten
helt, og **det er den rigtige adfærd**: `chat.use` står ikke på viewer-listen.
