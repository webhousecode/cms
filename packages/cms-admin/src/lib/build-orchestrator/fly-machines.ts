/**
 * F144 P2 — Fly Machines API client (build-VM lifecycle).
 *
 * Three primitives the build-orchestrator uses:
 *
 *   spawnBuilder(opts)           → POST /v1/apps/<app>/machines
 *                                  Returns { id, region, state }
 *                                  Includes /build/source.tar.gz +
 *                                  /build/Dockerfile via `files:` and
 *                                  injects SITE_ID/SHA/TARGET_APP/etc env.
 *
 *   streamBuilderLogs(id, onLine) → SSE-like polling of logs API,
 *                                   yields stdout lines as they arrive.
 *                                   Returns a cancel function.
 *
 *   awaitBuilderCompletion(id)   → Polls GET /v1/apps/<app>/machines/<id>
 *                                  until state ∈ {stopped, destroyed,
 *                                  failed}. Returns {success, exitCode,
 *                                  durationMs}.
 *
 * The Fly token comes from FLY_API_TOKEN env. cms-admin's existing
 * fly-deployment plumbing already requires this, so no new secret.
 */

const FLY_API_BASE = "https://api.machines.dev";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface SpawnBuilderOptions {
  /** Fly app that hosts the builder VM (must exist; use `webhouse-builders` or similar shared app). */
  appName: string;
  /** Site id — becomes part of the machine name + image tag. */
  siteId: string;
  /** Commit SHA or content hash — image tag suffix. */
  sha: string;
  /** Target Fly app the resulting image will deploy to. */
  targetApp: string;
  /** Builder image (e.g. ghcr.io/webhousecode/cms-builder:latest). */
  builderImage: string;
  /** GHCR push token for the builder to use. Short-lived. */
  registryToken: string;
  /** URL the builder should POST status callbacks to. */
  callbackUrl: string;
  /** Bearer token for callback POSTs. */
  callbackToken: string;
  /** Source tar contents (already gzipped). Base64-encoded into Fly's `files:`. */
  sourceTarGz: Buffer;
  /** Generated framework Dockerfile contents. */
  dockerfile: string;
  /** Region — default "arn" per global policy. */
  region?: string;
  /** Machine size — default shared-cpu-4x@4096MB. */
  cpus?: number;
  /** RAM in MB — default 4096. */
  memoryMb?: number;
  /** Override Fly API token (for tests). Falls back to FLY_API_TOKEN. */
  flyToken?: string;
}

export interface SpawnedBuilder {
  machineId: string;
  region: string;
  state: string;
}

export interface BuilderCompletion {
  success: boolean;
  exitCode: number | null;
  durationMs: number;
  finalState: string;
}

function flyHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function resolveToken(override?: string): string {
  const t = override ?? process.env.FLY_API_TOKEN;
  if (!t) {
    throw new Error(
      "F144: FLY_API_TOKEN env var is required to spawn build VMs. " +
        "Set it on cms-admin (Fly secret) before triggering an SSR deploy.",
    );
  }
  return t;
}

/**
 * Spawn a new ephemeral builder VM. Returns immediately once Fly has
 * acknowledged the create — does NOT wait for the build to finish.
 */
export async function spawnBuilder(opts: SpawnBuilderOptions): Promise<SpawnedBuilder> {
  const token = resolveToken(opts.flyToken);
  const region = opts.region ?? "arn";
  const cpus = opts.cpus ?? 4;
  const memoryMb = opts.memoryMb ?? 4096;

  const machineName = `build-${opts.siteId}-${opts.sha.slice(0, 8)}-${Date.now().toString(36)}`;

  const payload = {
    name: machineName,
    region,
    config: {
      image: opts.builderImage,
      guest: { cpu_kind: "shared", cpus, memory_mb: memoryMb },
      auto_destroy: true,
      restart: { policy: "no" },
      env: {
        SITE_ID: opts.siteId,
        SHA: opts.sha,
        TARGET_APP: opts.targetApp,
        REGISTRY_TOKEN: opts.registryToken,
        CALLBACK_URL: opts.callbackUrl,
        CALLBACK_TOKEN: opts.callbackToken,
      },
      files: [
        {
          guest_path: "/build/source.tar.gz",
          raw_value: opts.sourceTarGz.toString("base64"),
        },
        {
          guest_path: "/build/Dockerfile",
          raw_value: Buffer.from(opts.dockerfile, "utf-8").toString("base64"),
        },
      ],
    },
  };

  const url = `${FLY_API_BASE}/v1/apps/${encodeURIComponent(opts.appName)}/machines`;
  const res = await fetch(url, {
    method: "POST",
    headers: flyHeaders(token),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fly Machines spawn failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { id?: string; region?: string; state?: string };
  if (!data.id) {
    throw new Error(`Fly Machines spawn returned no machine id: ${JSON.stringify(data)}`);
  }
  return { machineId: data.id, region: data.region ?? region, state: data.state ?? "unknown" };
}

/**
 * Poll the builder machine until it reaches a terminal state (stopped,
 * destroyed, failed). Returns aggregate completion info.
 *
 * Default polling: every 5 sec, max 30 min wall-time.
 */
export async function awaitBuilderCompletion(args: {
  appName: string;
  machineId: string;
  flyToken?: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}): Promise<BuilderCompletion> {
  const token = resolveToken(args.flyToken);
  const pollMs = args.pollIntervalMs ?? 5_000;
  const maxMs = args.maxWaitMs ?? 30 * 60 * 1000;
  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > maxMs) {
      return { success: false, exitCode: null, durationMs: elapsed, finalState: "timeout" };
    }

    const url = `${FLY_API_BASE}/v1/apps/${encodeURIComponent(args.appName)}/machines/${encodeURIComponent(args.machineId)}`;
    const res = await fetch(url, {
      headers: flyHeaders(token),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Transient error — wait + retry instead of failing the whole build
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    const data = (await res.json()) as {
      state?: string;
      events?: Array<{ type?: string; status?: string; request?: { exit_event?: { exit_code?: number } } }>;
    };
    const state = data.state ?? "unknown";

    // Terminal states from Fly Machines docs:
    //   created, starting, started, stopping, stopped, destroying, destroyed,
    //   replacing, suspended, failed
    if (state === "destroyed" || state === "failed" || state === "stopped") {
      // Try to extract exit code from events
      let exitCode: number | null = null;
      for (const ev of data.events ?? []) {
        if (ev.type === "exit" && typeof ev.request?.exit_event?.exit_code === "number") {
          exitCode = ev.request.exit_event.exit_code;
          break;
        }
      }
      const success = state !== "failed" && (exitCode === null || exitCode === 0);
      return { success, exitCode, durationMs: Date.now() - start, finalState: state };
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * Stream stdout/stderr from a builder machine's logs as they appear.
 * Returns a cancel function. Auto-stops when machine reaches a terminal
 * state.
 *
 * Uses Fly's logs API which supports tail-style polling. Implemented as
 * setInterval to avoid SSE complexity; trades sub-second latency for
 * predictable behavior across edge cases.
 */
export function streamBuilderLogs(args: {
  appName: string;
  machineId: string;
  onLine: (line: string) => void;
  flyToken?: string;
  pollIntervalMs?: number;
}): () => void {
  const token = resolveToken(args.flyToken);
  const pollMs = args.pollIntervalMs ?? 2_000;
  let cancelled = false;
  let lastTimestamp = 0;

  const poll = async () => {
    if (cancelled) return;
    try {
      const url = `${FLY_API_BASE}/v1/apps/${encodeURIComponent(args.appName)}/machines/${encodeURIComponent(args.machineId)}/logs`;
      const res = await fetch(url, {
        headers: flyHeaders(token),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = (await res.json()) as { logs?: Array<{ timestamp?: number; message?: string }> };
        for (const entry of data.logs ?? []) {
          const ts = entry.timestamp ?? 0;
          if (ts <= lastTimestamp) continue;
          lastTimestamp = ts;
          if (entry.message) args.onLine(entry.message);
        }
      }
    } catch { /* swallow — next poll retries */ }

    if (!cancelled) setTimeout(poll, pollMs);
  };

  // Kick off the poll loop without awaiting — caller wants the cancel handle.
  void poll();

  return () => { cancelled = true; };
}

/**
 * One-shot helper that wraps spawn + log-stream + completion in a single
 * call. Use when you don't need fine-grained control.
 */
export async function runBuilderEndToEnd(opts: SpawnBuilderOptions & {
  onLog?: (line: string) => void;
}): Promise<{ machineId: string; completion: BuilderCompletion; imageTag: string }> {
  const spawn = await spawnBuilder(opts);
  let cancelLogs: (() => void) | null = null;
  if (opts.onLog) {
    cancelLogs = streamBuilderLogs({
      appName: opts.appName,
      machineId: spawn.machineId,
      onLine: opts.onLog,
      ...(opts.flyToken ? { flyToken: opts.flyToken } : {}),
    });
  }
  try {
    const completion = await awaitBuilderCompletion({
      appName: opts.appName,
      machineId: spawn.machineId,
      ...(opts.flyToken ? { flyToken: opts.flyToken } : {}),
    });
    const imageTag = `ghcr.io/webhousecode/${opts.siteId}:${opts.sha}`;
    return { machineId: spawn.machineId, completion, imageTag };
  } finally {
    cancelLogs?.();
  }
}
