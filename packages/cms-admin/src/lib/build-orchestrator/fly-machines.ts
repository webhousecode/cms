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

import { FlyApiError, FlyClient, FlyTimeoutError, isRetryableStatus } from "@broberg/deploy-core";


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
      restart: { policy: "no" as const },
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

  const machine = await new FlyClient({ token }).createMachine(opts.appName, payload.config, {
    name: payload.name,
    region: payload.region,
  });
  if (!machine?.id) {
    throw new Error(`Fly Machines spawn returned no machine id: ${JSON.stringify(machine)}`);
  }
  return { machineId: machine.id, region: machine.region ?? region, state: machine.state ?? "unknown" };
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

  // Transient failures (network, 408/429/5xx) are retried inside FlyClient;
  // a permanent one (401, 403, 404) throws at once instead of looking like a
  // slow build for 30 minutes.
  try {
    const exit = await new FlyClient({ token }).waitForExit(args.appName, args.machineId, {
      maxMs,
      pollMs,
    });
    // No exit code means Fly recorded no verdict — that is not a success.
    const success = exit.state !== "failed" && exit.exitCode === 0;
    return { success, exitCode: exit.exitCode, durationMs: Date.now() - start, finalState: exit.state };
  } catch (err) {
    if (err instanceof FlyTimeoutError) {
      return { success: false, exitCode: null, durationMs: Date.now() - start, finalState: "timeout" };
    }
    throw err;
  }
}

/**
 * Stream a builder machine's log lines as they appear.
 * Returns a cancel function.
 *
 * F200.4 — this used to GET api.machines.dev/.../machines/<id>/logs, an
 * address Fly does not serve (404), and swallowed every non-ok answer, so the
 * builder log never showed a single line while nothing ever went red.
 * FlyClient.getMachineLogs() talks to Fly's real logs API, and each poll hands
 * back a nextToken so only newer lines are fetched.
 *
 * A failure is REPORTED, not swallowed: onError gets it (console.error when no
 * handler is given). A permanent refusal (4xx other than 408/429) stops the
 * stream — polling a wrong token every two seconds for the length of a build
 * only repeats the same no.
 */
export function streamBuilderLogs(args: {
  appName: string;
  machineId: string;
  onLine: (line: string) => void;
  onError?: (err: unknown) => void;
  flyToken?: string;
  pollIntervalMs?: number;
}): () => void {
  const token = resolveToken(args.flyToken);
  const pollMs = args.pollIntervalMs ?? 2_000;
  const report = args.onError ?? ((err: unknown) => {
    console.error("[builder-logs]", err instanceof Error ? err.message : err);
  });
  let cancelled = false;
  let nextToken: string | null = null;

  const poll = async () => {
    if (cancelled) return;
    try {
      const page = await new FlyClient({ token }).getMachineLogs(args.appName, args.machineId, { nextToken });
      if (page.nextToken) nextToken = page.nextToken;
      for (const entry of page.entries) {
        if (cancelled) break;
        args.onLine(entry.message);
      }
    } catch (err) {
      report(err);
      if (err instanceof FlyApiError && !isRetryableStatus(err.status)) return; // permanent: stop
    }

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
