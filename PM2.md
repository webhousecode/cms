# PM2 — local dev process manager

PM2 keeps the long-running Next.js dev servers (and a couple of helper
processes) alive across terminal sessions so you don't have to juggle
multiple terminal tabs. This file documents how we use it in this repo.

## Installation

Same version Claude Code invokes via `npx` internally — pin it explicitly
so we don't drift:

```bash
npm install -g pm2@6.0.14
```

Verify:

```bash
pm2 --version
# 6.0.14
```

If you ever want to upgrade, bump the version in this file and run the
install again. Don't use `npm install -g pm2@latest` unattended — minor
versions have shipped breaking changes in the past.

## Where the config lives

The single source of truth for what PM2 manages is:

```
/Users/cb/Apps/webhouse/cms/ecosystem.config.js
```

It registers the following apps:

| Name              | Port  | Path                                            | Purpose |
|-------------------|-------|-------------------------------------------------|---------|
| `cms-admin`       | 3010  | `packages/cms-admin/`                           | The live admin dev server (runs `pnpm dev`) |
| `cms-admin-prod`  | 4010  | `packages/cms-admin/.next/standalone/...`       | Production build of the same admin, for perf testing |
| `webhouse-site`   | 3009  | `/Users/cb/Apps/webhouse/webhouse-site/`        | Marketing + dogfooding site |
| `cms-docs`        | 3036  | `/Users/cb/Apps/webhouse/cms-docs/`             | docs.webhouse.app source |
| `sproutlake`      | 3002  | `/Users/cb/Apps/cbroberg/sproutlake/`           | Demo Next.js site |

The test sites (`webhouse-site`, `cms-docs`, `sproutlake`) are invoked
via `node_modules/next/dist/bin/next dev` directly to avoid pnpm-wrapper
zombie processes if Next crashes. `cms-admin` is the **one exception** —
it runs `pnpm dev` literally so it matches the manual workflow exactly.
If `cms-admin` ever hangs after a Next crash, recover with
`pm2 restart cms-admin`.

## Daily commands

| Command | What it does |
|---|---|
| `pm2 list` (or `pm2 ls`, `pm2 status`) | Tabular view of all apps + status / cpu / mem / restarts |
| `pm2 logs` | Live tail of every app's logs at once |
| `pm2 logs cms-admin` | Live tail of one specific app |
| `pm2 logs cms-admin --lines 100` | Last 100 lines, then live tail |
| `pm2 logs cms-admin --err` | Only stderr |
| `pm2 restart cms-admin` | Restart one app (preserves config) |
| `pm2 reload cms-admin` | Zero-downtime reload (only useful for cluster mode) |
| `pm2 stop cms-admin` | Stop without removing |
| `pm2 start cms-admin` | Start a stopped app (must already exist) |
| `pm2 delete cms-admin` | Remove from PM2's list |
| `pm2 describe cms-admin` | Detailed info — pid, args, env, restart count, exit codes |
| `pm2 monit` | Interactive fullscreen dashboard (CPU/mem live, log tail) |
| `pm2 flush` | Truncate every log file |
| `pm2 save` | Persist the current process list to `~/.pm2/dump.pm2` so it survives reboot |
| `pm2 resurrect` | Restore the saved process list (used after reboot) |

### Bootstrapping after a reboot

```bash
# 1. PM2 daemon starts itself the first time you call any pm2 command
# 2. Restore the saved process list:
pm2 resurrect

# Or, to make it automatic on every boot:
pm2 startup
# Run the command it prints, then:
pm2 save
```

`pm2 startup` registers a launchd plist on macOS so the daemon starts at
login. Combined with `pm2 save`, every app in `pm2 list` at the time of
the save will come back up automatically.

### Adding a new app

1. Edit `ecosystem.config.js` and add your app to the `apps` array.
2. Start it: `pm2 start ecosystem.config.js --only <name>`
3. Persist: `pm2 save`

### Removing an app

```bash
pm2 delete <name>
pm2 save
```

Then remove its entry from `ecosystem.config.js` so it doesn't come back
the next time someone runs `pm2 start ecosystem.config.js`.

## Helper scripts

The repo also has a small wrapper script for common operations:

```bash
bash scripts/pm2-pool.sh up       # start the whole pool, killing any conflicting standalone servers first
bash scripts/pm2-pool.sh down     # stop + delete the pool
bash scripts/pm2-pool.sh status   # alias for pm2 list
bash scripts/pm2-pool.sh logs cms-admin
```

The script is mostly useful when you're starting fresh — for day-to-day
work, raw `pm2 ...` commands are simpler.

## Hard rule for Claude Code

`cms-admin` on port 3010 is the live development server. Claude Code is
**not allowed** to:

- `kill` / `pkill` processes on port 3010
- `lsof -i :3010 +` kill
- `pm2 stop cms-admin` or `pm2 delete cms-admin`
- bind anything else to port 3010 (Docker, alt. Next instance, etc.)

…unless the user **explicitly** tells it to in the current message.
Claude Code MAY:

- Read-only checks (`pm2 list`, `pm2 logs cms-admin`, `curl http://localhost:3010/admin/login`)
- `pm2 restart cms-admin` only when the user explicitly asks

This rule lives in [`CLAUDE.md`](./CLAUDE.md) too.

## Useful aliases

Drop in your `~/.zshrc` if you find yourself typing the long forms a lot:

```bash
alias pml='pm2 list'
alias pmc='pm2 logs cms-admin --lines 50'
alias pmm='pm2 monit'
```
