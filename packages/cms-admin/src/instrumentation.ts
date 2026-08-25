/**
 * Next.js instrumentation hook — runs once on server startup.
 * Delegates to instrumentation-node.ts via dynamic import so Next.js
 * doesn't try to compile Node.js-only code (fs, path) for Edge Runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSchedulers } = await import("./instrumentation-node");
    startSchedulers();
  }
}

/**
 * Next.js hands us every server error it caught — a throw inside a route
 * handler, a server component render, a server action.
 *
 * This door is not optional. Next catches those itself and turns them into a
 * 500; they never reach `uncaughtException`, so the SDK's own process handlers
 * cannot see them. Without this, "server-side reporting is on" would still miss
 * the errors that actually reach a user.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routeType?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { captureServerError } = await import("./lib/upmetrics-server");
    captureServerError(err, {
      // The path, never the query string — it carries tokens and ?site=.
      path: request?.path?.split("?")[0],
      method: request?.method,
      routerKind: context?.routerKind,
      routeType: context?.routeType,
    });
  } catch {
    // Reporting an error must never become an error.
  }
}
