/**
 * In-memory broadcast for LiveRefresh SSE.
 * Revalidation endpoint calls broadcast() → all connected SSE clients receive the event.
 */

type Listener = (event: Record<string, unknown>) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcast(event: Record<string, unknown>): void {
  for (const listener of listeners) {
    listener(event);
  }
}
