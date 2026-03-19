# F54 — Local AI Tunnel

> Use a Claude Code Max/Pro subscription as the AI backend for CMS admin during development — zero API cost for dev and testing.

## Problem

Every CMS installation currently requires a separate Anthropic API key (`sk-ant-api03-…`) for AI features (content generation, interactive editing, rewriting). This means:

1. **Double billing during development** — the developer already pays for Claude Code Max/Pro, but still needs API credits for CMS AI features
2. **Onboarding friction** — new users must create an Anthropic Console account and set up billing before they can try AI features
3. **Cost uncertainty** — developers testing AI-heavy features (interactive generation, AI agents) can rack up unexpected API costs
4. **No AI in offline/air-gapped dev** — without an API key configured, AI features are completely dead

The CPM project (`codepromptmaker`) has already proven that Claude Code's OAuth token can be extracted from macOS Keychain and used programmatically in Docker containers, Fly.io machines, and local processes. This feature brings that pattern to the CMS.

## Solution

A **Local AI Tunnel** mode where the CMS admin routes AI requests through the developer's Claude Code subscription instead of a direct API key. The tunnel extracts the OAuth token from the local machine (Keychain on macOS, `.credentials.json` on Linux) and uses it as the Anthropic API key. This works because Claude Code's OAuth tokens (`sk-ant-oat01-…`) are valid Anthropic API credentials.

The tunnel is **development-only by design** — it requires a local Claude Code installation and is not suitable for production (token expires after ~29h, requires local machine). Production sites continue using standard API keys.

## Technical Design

### Token Resolution

Reuse the proven `resolveToken()` pattern from `cc-docker-demo/lib/common.mjs`:

```typescript
// packages/cms-admin/src/lib/ai-tunnel.ts

export interface TunnelToken {
  token: string;
  expiresAt: number | null;
  source: "env" | "keychain" | "credentials-file";
}

/**
 * Resolve Claude Code OAuth token (priority order):
 * 1. CLAUDE_CODE_OAUTH_TOKEN env var (externally managed)
 * 2. CLAUDE_CODE_SESSION_ACCESS_TOKEN env var (set by CC itself)
 * 3. macOS Keychain: `security find-generic-password -s "Claude Code-credentials" -w`
 * 4. ~/.claude/.credentials.json (Linux / macOS fallback)
 */
export async function resolveToken(): Promise<TunnelToken | null> {
  // 1. Explicit env var
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
    ?? process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
  if (envToken) {
    return { token: envToken, expiresAt: null, source: "env" };
  }

  // 2. macOS Keychain
  if (process.platform === "darwin") {
    try {
      const { execSync } = await import("child_process");
      const raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      const creds = JSON.parse(raw);
      // creds contains { accessToken, refreshToken, expiresAt, ... }
      if (creds.accessToken) {
        return {
          token: creds.accessToken,
          expiresAt: creds.expiresAt ? new Date(creds.expiresAt).getTime() : null,
          source: "keychain",
        };
      }
    } catch { /* not available */ }
  }

  // 3. Credentials file (Linux / fallback)
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const home = process.env.HOME ?? "/root";
    const raw = await readFile(join(home, ".claude", ".credentials.json"), "utf-8");
    const creds = JSON.parse(raw);
    if (creds.accessToken) {
      return {
        token: creds.accessToken,
        expiresAt: creds.expiresAt ? new Date(creds.expiresAt).getTime() : null,
        source: "credentials-file",
      };
    }
  } catch { /* not available */ }

  return null;
}

/** Check if token is still valid (> 30 min remaining) */
export function isTokenFresh(token: TunnelToken): boolean {
  if (!token.expiresAt) return true; // env-managed, assume fresh
  return token.expiresAt - Date.now() > 30 * 60 * 1000;
}
```

### Integration with AI Chat Route

The existing `/api/cms/ai/chat` route already resolves the API key via `getApiKey()`. The tunnel hooks into this:

```typescript
// packages/cms-admin/src/lib/ai-config.ts — extend getApiKey()

export async function getApiKey(provider?: string): Promise<string | null> {
  const config = await readAiConfig();
  const p = provider ?? config.defaultProvider;

  switch (p) {
    case "anthropic": {
      // Standard API key sources
      const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (apiKey) return apiKey;

      // Tunnel fallback: try Claude Code subscription token
      if (config.aiTunnelEnabled) {
        const { resolveToken, isTokenFresh } = await import("./ai-tunnel");
        const tunnel = await resolveToken();
        if (tunnel && isTokenFresh(tunnel)) return tunnel.token;
      }
      return null;
    }
    // ... other providers unchanged
  }
}
```

### Site Config Extension

```typescript
// Add to SiteConfig interface
interface SiteConfig {
  // ... existing fields ...
  /** Enable Local AI Tunnel — use Claude Code subscription for AI */
  aiTunnelEnabled: boolean;
}

// Default: false (opt-in)
```

### Admin UI — Settings → AI

New section in the AI tab, shown when no API key is configured (or always as an alternative):

```
┌─────────────────────────────────────────────┐
│ ⚡ Local AI Tunnel                           │
│                                              │
│ Use your Claude Code subscription for AI     │
│ features instead of a separate API key.      │
│ Development only — requires Claude Code      │
│ installed and authenticated on this machine.  │
│                                              │
│ Status: ● Connected (Keychain)               │
│ Token expires: 27h 14m                       │
│                                              │
│ [  Enable tunnel  ]                          │
│                                              │
│ ⚠ Not for production. Token expires ~29h.    │
│   Use a standard API key for deployed sites.  │
└─────────────────────────────────────────────┘
```

### API Endpoint — Tunnel Status

```typescript
// packages/cms-admin/src/app/api/admin/ai-tunnel/route.ts

GET /api/admin/ai-tunnel
→ {
    available: true,
    source: "keychain",          // "env" | "keychain" | "credentials-file"
    expiresAt: "2026-03-18T14:30:00Z",
    remainingHours: 27.2,
    fresh: true
  }
```

### Token Auto-Renewal

When the tunnel detects a token with < 2h remaining, it triggers auto-renewal by running:

```bash
claude -p "hi" --output-format text --max-turns 1
```

This causes Claude Code to refresh its OAuth token before the API call. The renewed token is written back to Keychain/credentials file automatically.

```typescript
// packages/cms-admin/src/lib/ai-tunnel.ts

export async function autoRenewIfNeeded(token: TunnelToken): Promise<void> {
  if (!token.expiresAt) return;
  const remaining = token.expiresAt - Date.now();
  if (remaining > 2 * 60 * 60 * 1000) return; // > 2h, no renewal needed

  const { execSync } = await import("child_process");
  const claudeBin = findClaudeBinary(); // probes known install locations
  if (!claudeBin) return;

  execSync(`${claudeBin} -p "hi" --output-format text --max-turns 1`, {
    timeout: 30000,
    stdio: "ignore",
  });
}
```

### CLI Integration

The `cms dev` command can auto-detect and suggest tunnel mode:

```bash
$ npx cms dev

⚡ No Anthropic API key found.
  Claude Code subscription detected (macOS Keychain).
  Enable Local AI Tunnel? [Y/n]

✓ AI Tunnel active — using Claude Code subscription
  Token expires in 27h. AI features are ready.
```

## Security Considerations

- **Token never leaves the machine** — tunnel only works locally, token is used server-side in Next.js API routes
- **Not for production** — clear warnings, token expires after ~29h, requires local Claude Code
- **Opt-in** — disabled by default, must be explicitly enabled in Settings or CLI
- **No token storage** — CMS never persists the token, resolves it fresh on each request (with short in-memory cache)
- **Keychain access** — macOS will prompt for permission on first access

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/ai-tunnel.ts` — new token resolution module
- `packages/cms-admin/src/lib/ai-config.ts` — extend `getApiKey()` with tunnel fallback
- `packages/cms-admin/src/app/api/admin/ai-tunnel/route.ts` — new status endpoint
- Site Settings → AI tab — new tunnel section

### Blast radius
- `getApiKey()` is called for every AI request — tunnel fallback adds token resolution overhead
- Token expiry could cause intermittent AI failures

### Breaking changes
- None — tunnel is opt-in via `aiTunnelEnabled` flag

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Token resolved from macOS Keychain
- [ ] AI requests succeed using tunnel token
- [ ] Token freshness check prevents expired token use
- [ ] Settings UI shows tunnel status and expiry

## Implementation Steps

1. **`ai-tunnel.ts`** — Token resolution module (`resolveToken`, `isTokenFresh`, `autoRenewIfNeeded`, `findClaudeBinary`)
2. **Extend `getApiKey()`** — Add tunnel fallback when `aiTunnelEnabled` and no API key configured
3. **`SiteConfig` extension** — Add `aiTunnelEnabled: boolean` (default: false)
4. **API endpoint** — `GET /api/admin/ai-tunnel` returns tunnel status
5. **Settings UI** — "Local AI Tunnel" section in Settings → AI tab with status, toggle, expiry countdown
6. **CLI auto-detect** — `cms dev` suggests tunnel when no API key found
7. **In-memory token cache** — Cache resolved token for 5 minutes to avoid hitting Keychain on every request

## Dependencies

- Claude Code installed and authenticated on the developer's machine (Pro/Max plan)
- macOS Keychain or `~/.claude/.credentials.json` accessible
- No CMS feature dependencies — this is a standalone enhancement to the AI config layer

## Prior Art

- **cc-docker-demo** (`~/Apps/cbroberg/cc-docker-demo`) — Working proof-of-concept with `resolveToken()`, `autoRenewIfNeeded()`, token relay to Docker/Fly.io
- **CPM v4 runner plan** (`codepromptmaker/docs/v4-cpm-autonomous-runner-plan-add-2.md`) — Full token lifecycle documentation, 4 execution modes tested

## Effort Estimate

**Small** — 2-3 days

- Day 1: `ai-tunnel.ts` + `getApiKey()` integration + API endpoint
- Day 2: Settings UI + CLI auto-detect
- Day 3: Testing across macOS/Linux, token renewal, edge cases
