/**
 * In-memory chat job store.
 *
 * POST /api/mobile/chat creates a job, runs the upstream SSE in the background,
 * and accumulates events. GET /api/mobile/chat/poll reads accumulated events.
 *
 * Jobs auto-expire after 10 minutes to prevent memory leaks.
 */

export interface ChatEvent {
  event: string;
  data: unknown;
}

export interface ChatJob {
  events: ChatEvent[];
  done: boolean;
  createdAt: number;
}

export const chatJobs = new Map<string, ChatJob>();

// Cleanup old jobs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of chatJobs) {
    if (now - job.createdAt > 10 * 60 * 1000) {
      chatJobs.delete(id);
    }
  }
}, 5 * 60 * 1000);
