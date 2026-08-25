import { init, setTag, captureException } from "@upmetrics/sdk";

/**
 * Server-side error reporting.
 *
 * Until 25 Aug 2026 the SDK was initialised in exactly one place —
 * `components/upmetrics-provider.tsx`, a client component. So cms-admin
 * reported errors from editors' browsers and NOTHING from the server: every
 * failing `/api/*` route, every scheduled job that threw, every server
 * component that crashed, invisible.
 *
 * That is worse than having no dashboard, because a dashboard that only sees
 * one half still LOOKS like coverage. It was found by chasing a noisy alert
 * whose timing happened to match a scheduler tick — the scheduler could not
 * have been the source, because nothing on the server was reporting at all.
 *
 * Two doors, and both are needed:
 *   - this init() installs the SDK's `unhandledRejection` / `uncaughtException`
 *     handlers, which is what catches a scheduler blowing up in the background;
 *   - `onRequestError` in instrumentation.ts catches what Next.js swallows —
 *     an error inside a route handler never reaches `uncaughtException`, Next
 *     turns it into a 500 and moves on.
 */

/** Read once so the two doors cannot disagree about whether reporting is on. */
let ready = false;

function dsn(): string | undefined {
  // UPMETRICS_DSN is the runtime name; NEXT_PUBLIC_UPMETRICS_DSN is the same
  // value under the name the browser bundle needs, kept as a fallback so a
  // machine that only has the old variable still reports.
  return process.env.UPMETRICS_DSN || process.env.NEXT_PUBLIC_UPMETRICS_DSN || undefined;
}

export function initServerReporting(): boolean {
  if (ready) return true;
  const d = dsn();
  if (!d) {
    // Ship dark: no key, no reporting, no crash. Says so once so a machine
    // that is silently unmonitored can be told apart from one with no errors.
    console.warn("[upmetrics] no DSN — server-side error reporting is OFF");
    return false;
  }
  init({
    dsn: d,
    environment: process.env.NODE_ENV,
    // The sha, not a constant. `release: "cms-admin"` on every event for three
    // months is precisely why nobody could tell which deploy introduced what —
    // and it is the fingerprint that says "this project only reports from the
    // browser", since the browser half sets exactly that.
    release: process.env.GIT_SHA || "dev",
  });
  // Server and browser must be tellable apart, or the two halves add up to one
  // number that answers neither question.
  setTag("runtime", "server");
  ready = true;
  console.log("[upmetrics] server-side error reporting ON");
  return true;
}

/** Report an error Next.js caught for us (route handler, RSC render, …). */
export function captureServerError(err: unknown, ctx?: Record<string, unknown>): void {
  if (!ready && !initServerReporting()) return;
  try {
    captureException(err, ctx);
  } catch {
    // Reporting an error must never become an error.
  }
}
