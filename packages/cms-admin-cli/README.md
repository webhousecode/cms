# @webhouse/cms-admin-cli

Run the [CMS Admin UI](https://github.com/webhousecode/cms) locally with a single command.

## Usage

```bash
npx @webhouse/cms-admin-cli
```

This downloads, builds, and caches the admin UI on first run (~2 min). Subsequent starts are instant.

## Options

```bash
npx @webhouse/cms-admin-cli --port 4000           # Custom port (default: 3010)
npx @webhouse/cms-admin-cli --config ./cms.config.ts  # Point to your config
npx @webhouse/cms-admin-cli --update               # Force re-download
```

## Auto-detection

If your current directory contains a `cms.config.ts`, it will be used automatically.

## Alternatives

- **Hosted**: [webhouse.app](https://webhouse.app) — no install needed
- **Docker**: `docker run -p 3010:3010 -v $(pwd):/site ghcr.io/webhousecode/cms-admin`
- **Git clone**: `git clone https://github.com/webhousecode/cms.git && cd cms && pnpm install && pnpm dev`
