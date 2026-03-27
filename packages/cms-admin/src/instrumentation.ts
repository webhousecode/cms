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
