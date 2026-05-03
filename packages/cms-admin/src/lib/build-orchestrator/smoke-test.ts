/**
 * F144 P6 — Smoke-test a freshly-built image.
 *
 * After buildSsrSite() succeeds and a Fly app deploy lands the new
 * image, we poll the app's health endpoint until it returns 200 (or
 * until a budget elapses). Used by the deploy pipeline to gate traffic
 * switch — if the smoke test fails, the build is marked failed and the
 * caller can roll back without exposing a broken app.
 *
 * Defaults are conservative: 5-minute total budget, 10-second backoff,
 * 3 consecutive 200s required before declaring healthy. Override via
 * args for fast-CI tests.
 */

export interface SmokeTestOptions {
  /** URL to GET — usually `https://<targetApp>.fly.dev/api/health`. */
  url: string;
  /** Total wall-time budget in ms. Default: 5 minutes. */
  budgetMs?: number;
  /** Delay between polls in ms. Default: 10 seconds. */
  pollIntervalMs?: number;
  /** Required consecutive successes before "healthy". Default: 3. */
  requiredOk?: number;
  /** Per-request timeout in ms. Default: 5 seconds. */
  requestTimeoutMs?: number;
  /** Optional log callback — receives one line per poll. */
  onLog?: (line: string) => void;
  /** Inject fetch (for tests). Default: globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface SmokeTestResult {
  healthy: boolean;
  attempts: number;
  okStreak: number;
  durationMs: number;
  /** Last status code seen (0 if all attempts errored before reaching server). */
  lastStatus: number;
  /** Last error message, if the final attempt failed. */
  lastError?: string;
}

const DEFAULT_BUDGET_MS = 5 * 60 * 1000;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_REQUIRED_OK = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export async function smokeTestImage(opts: SmokeTestOptions): Promise<SmokeTestResult> {
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
  const requiredOk = opts.requiredOk ?? DEFAULT_REQUIRED_OK;
  const reqTimeout = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const log = opts.onLog ?? ((_l: string) => {});

  const start = Date.now();
  let attempts = 0;
  let okStreak = 0;
  let lastStatus = 0;
  let lastError: string | undefined;

  while (Date.now() - start < budget) {
    attempts++;
    try {
      const res = await fetchFn(opts.url, {
        method: "GET",
        signal: AbortSignal.timeout(reqTimeout),
      });
      lastStatus = res.status;
      if (res.status >= 200 && res.status < 300) {
        okStreak++;
        log(`[smoke ${attempts}] ok ${res.status} (streak=${okStreak}/${requiredOk})`);
        if (okStreak >= requiredOk) {
          return {
            healthy: true,
            attempts,
            okStreak,
            durationMs: Date.now() - start,
            lastStatus,
          };
        }
      } else {
        okStreak = 0;
        log(`[smoke ${attempts}] non-2xx ${res.status} (streak reset)`);
      }
    } catch (err) {
      okStreak = 0;
      lastError = err instanceof Error ? err.message : String(err);
      log(`[smoke ${attempts}] error: ${lastError} (streak reset)`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return {
    healthy: false,
    attempts,
    okStreak,
    durationMs: Date.now() - start,
    lastStatus,
    ...(lastError && { lastError }),
  };
}
