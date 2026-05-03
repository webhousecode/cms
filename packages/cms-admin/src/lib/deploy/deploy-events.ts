/**
 * In-process event bus for deploy-related events (page_build webhook, etc.).
 * SSE endpoints subscribe; webhook receivers publish.
 *
 * Process-local — works for single-instance cms-admin (Fly app, PM2 dev).
 * For multi-instance setups we'd swap this for Redis pub/sub or similar.
 *
 * Channel key = `${orgId}:${siteId}` so subscribers only get events for
 * the site they care about.
 */
export interface DeployEvent {
  type: "page-build";
  orgId: string;
  siteId: string;
  /** "queued" | "building" | "built" | "errored" — from GH page_build event. */
  status: "queued" | "building" | "built" | "errored";
  /** GH commit sha that produced the build. */
  sha?: string;
  /** Live URL once status === "built". */
  url?: string;
  /** Error string when status === "errored". */
  error?: string;
  /** GH-reported duration in seconds. */
  duration?: number;
  /** ISO time the event was received by us. */
  ts: string;
}

type Listener = (event: DeployEvent) => void;

const listeners = new Map<string, Set<Listener>>();

function key(orgId: string, siteId: string): string { return `${orgId}:${siteId}`; }

/**
 * Subscribe to events for a specific site. Returns an unsubscribe function.
 */
export function subscribe(orgId: string, siteId: string, fn: Listener): () => void {
  const k = key(orgId, siteId);
  let set = listeners.get(k);
  if (!set) { set = new Set(); listeners.set(k, set); }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(k);
  };
}

/** Publish an event. All current subscribers for that (org, site) get a sync callback. */
export function publish(event: DeployEvent): void {
  const set = listeners.get(key(event.orgId, event.siteId));
  if (set) {
    for (const fn of set) {
      try { fn(event); } catch { /* one bad listener shouldn't break others */ }
    }
  }
  // Side channel: native push (Web Push / iOS / Android) for users who
  // opted into browser notifications. Fire-and-forget — never blocks SSE
  // listeners or the calling webhook handler.
  if (event.status === "built" || event.status === "errored") {
    void dispatchPush(event).catch((err) => {
      console.warn("[deploy-events] push dispatch failed:", err);
    });
  }
}

async function dispatchPush(event: DeployEvent): Promise<void> {
  const { broadcastPush } = await import("../push-send");
  const isBuilt = event.status === "built";
  await broadcastPush({
    title: isBuilt ? "Site is live 🌐" : "Deploy failed",
    body: isBuilt
      ? (event.url ?? "Your changes are now live on GitHub Pages.")
      : (event.error ?? "GitHub Pages build errored — see Site Settings → Deploy."),
    topic: isBuilt ? "build_succeeded" : "build_failed",
    ...(event.url && { url: event.url }),
    data: {
      siteId: event.siteId,
      orgId: event.orgId,
      ...(event.sha && { sha: event.sha }),
    },
  });
}

/** Diagnostic: how many open connections per site. */
export function listenerCount(orgId: string, siteId: string): number {
  return listeners.get(key(orgId, siteId))?.size ?? 0;
}
