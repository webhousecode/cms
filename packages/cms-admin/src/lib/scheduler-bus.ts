/**
 * In-memory event bus for scheduler → SSE push.
 * Lives in Node.js process memory — no files, no polling.
 */
import { EventEmitter } from "events";

export interface SchedulerEvent {
  id: string;
  action: "published" | "unpublished";
  collection: string;
  slug: string;
  title: string;
  timestamp: string;
}

// Singleton across hot reloads (globalThis survives Next.js HMR)
const key = "__cms_scheduler_bus__";
const bus: EventEmitter = (globalThis as any)[key] ?? ((globalThis as any)[key] = new EventEmitter());
bus.setMaxListeners(100); // allow many concurrent SSE connections

export function emitSchedulerEvents(events: SchedulerEvent[]) {
  for (const evt of events) {
    bus.emit("scheduler-event", evt);
  }
}

export function onSchedulerEvent(handler: (evt: SchedulerEvent) => void): () => void {
  bus.on("scheduler-event", handler);
  return () => bus.off("scheduler-event", handler);
}
