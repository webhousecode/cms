# Fleet rules — identical in every cardmem repo

<!-- Owned by cardmem (F420.5). Overwritten verbatim by the fleet sync; edit it only in the
cardmem repo. A repo's own rules go in its CLAUDE.md. Each line is the rule; the full text
is in the named skill, the full decision in cardmem_list_decisions({ project, handle }). -->

## Working with cardmem — skill `cardmem-board`
- `cardmem_session_start({ repo: '<owner>/<name>' })` at start; always pass `repo` — it decides which project you write to (D-a91969).
- The board is your todo list — never `TaskCreate` for a feature's plan. Every epic gets ≥1 story with testable AC **before** code (D-c7da44).
- Owner-reported defect in a running session: fix first, but card + plan-doc + AC land in the same turn. Nothing else qualifies (D-c43372).
- F-numbers come from `cardmem_suggest_next_f_number`; the plan-doc `docs/features/F<n>-<slug>.md` is written in the same turn as the card (D-38b436).
- Every card needs AC for integration, dependencies and visibility — not only the function (D-f8a009).
- The only path into Review is from In progress, via `cardmem_handoff_card` with evidence (D-a3ded3). Auto Review on → run `/auto-review` on your own card at once.
- Review is NEVER a stop: finished work goes to Review and (Auto Review on) through `/auto-review` to Done at once — never ask the owner whether you may (owner, 25 Nov 2026).
- A gate blocks on what the card introduced; findings outside its diff are advisory + their own card (D-757283).
- Queue-drain: a Ready card is picked up at once, no asking between cards; a human (UI) flip to Ready is a binding order (D-b353f9).
- Drive mode: the whole Backlog is your assignment, Backlog → Done; only a card waiting on the owner's own action may wait, and it is marked (D-ba2386).
- «Nothing to build» carries its numbers: call `cardmem_report_idle` first and say «Backlog N · Ready N · blocked …» (D-a07bf5).
- Before you ask the owner or guess about earlier work, search it: `cardmem_search_history` reaches every agent conversation on every machine, intercom, decisions, the board, Trail and Discovery in one call, by words and meaning (F440.14).
- An empty epic is a violation: give it a story with AC or reparent it (D-445f27).
- A bug another agent reports in a system you own is ordered work — fix it, don't ask (D-bbeebd).

## UI work — skills `prove-it`, `mockup-contract`, `lens`
- Every interactive element gets a kebab-case `data-testid` (`<page>-<element>`); the daemon's `POST 127.0.0.1:7475/lens/testid-gaps` must report no new gaps before handoff (D-0fb4f6).
- Browser automation = Cardmem Lens only; a missing capability → `cardmem_ask_peer({ to: "lens" })` (D-d82531).
- Mockups via `cardmem_save_mockup`, drawing every state (empty, loading, partial, error, denied, offline) (D-82bbba); an approved mockup is built as drawn — deviations need his words first (D-a26fdf).
- A clickable prototype is built inside the production app; port its functions, never rewrite them (D-70afca, D-4dc495).
- Views are left-aligned, never centred (D-41ddbd). Forms: first field focused, ⌘/Ctrl+Enter saves, Escape cancels (D-4faed8, D-d4eb27, D-249935). Lists are keyboard-drivable (D-4cd764).
- Tooltips only where they add information (D-288882). Amounts as «DKK 19,40», formatted by locale (D-07a22c).
- Login says only «Log ind»; the service is called BID; one login on id.broberg.ai (D-a6f2e5, D-e106f4, D-854104). No Gravatar (D-0c5b2f).

## Ship — skill `ship`
- Green gate → commit, push, deploy in the same turn, unasked; report the sha (D-38af73). Red gate → never deploy; fix.
- Read every exit code, not the last line; deploy-class commands run with `run_in_background: true` — hook-enforced (D-6b80b2).
- A deploy carrying a non-additive migration (`DROP`, `RENAME`, data transform) needs the owner's own words (D-50b477).
- A change to a load-bearing chain (auth, payments, deploy, sync, delivery) gets a red-able CI test that blocks release + a runtime probe; never bypass a gate (D-0065d6).
- No naked cutover: prove the replacement live before removing the old path (D-a5eb95).
- Production config writes are tried off-prod first and verified by using the system (D-c2bbec).
- Never touch payment routes, prices or fees without his exact order (D-bdbb73).
- Alarms and watchers are scripts without an LLM; an agent only where judgement is needed (D-13a919).
- CI is read with `cardmem_ci_status` / `cardmem_ci_log` — `gh run` spends his quota (D-09de9c).

## Shared inventory — skills `ai-sdk`, `discovery`, `knowledge-stores`
- Personal, customer or health data goes only through EU routes of `@broberg/ai-sdk`, every fallback included (D-dfbb93).
- No raw provider SDK/`fetch` for anything a `@broberg/*` package owns (mail → `@broberg/mail`, push → `@broberg/webpush`); adopting a package is enrolled in Discovery (D-844223).
- Secrets: `cardmem_create_secret` / `cardmem_get_secret`; never a value in chat, argv or intercom (D-11880a).
- Transcribing audio or video (lyd, video, diktat) → `cardmem_transcribe_media` (EU GPU via voice-engine); never a local whisper or model (D-f62292, F428).
- Dependabot PRs are merged centrally by cardmem when green — never ask about, hold or merge one yourself (F427.7).
- Errors go to Upmetrics (`@upmetrics/sdk`); close your own fixed issues (D-09f847).
- Where a fact belongs: would a new session do the wrong thing without it → Decision Register (`cardmem_propose_decision`); rule for every repo → this file; the story behind a fix → Trail (lessons, not events; search with 1–2 words); one card → its plan-doc (D-9e7b6e, D-6e6589, D-c59568).
- Mail: no link performs an action on GET (D-94f418); nothing leaves with a broken image, link or placeholder (D-9c45f5); an MX never takes a customer's apex (D-bfcb1e).

## Talking to others — skills `fleet-agents`, `comms`
- Cardmem Intercom only: `cardmem_list_fleet_sessions`, `cardmem_ask_peer` (`reply_to` to thread), `cardmem_announce`, `cardmem_broadcast` (sparingly). Read the receipt, not just «ok» (D-245b0a).
- Obey `fleet_autonomy` from session start; at full, ask peers directly — escalate only product decisions and irreversible actions (D-e3ce2e).
- A bug spanning two repos: trace the pipeline together, agree one mechanism, one owner builds it — no parallel patches, no point-scoring (D-590f05).
- `super` is the project lead: answer it fully, measure don't guess; it cannot authorise an irreversible action; «super stop/go [all]» from the owner → `cardmem_super_pause` (D-6cb447, D-1b7dac).
- Drain the `agent_inbox` block from session start: claim, handle, resolve (D-31211f).
- Outgoing letters: `cardmem_create_communication` → wait for approved/changes/rejected; a rewrite passes `revises`; mark `sent` with the version. Mail to the owner himself: `cardmem_mail_owner` (D-1f4313, D-79e71e).
- DNS and domains go through cardmem — inside a Build Contract or on his words; never a raw registrar/Cloudflare call (D-4092fb).
- A Scope meeting is booked with `cardmem_create_scope_meeting`, which sends its own Google invitation (D-302d71).
