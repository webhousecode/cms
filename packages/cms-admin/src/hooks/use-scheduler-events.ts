"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTabs } from "@/lib/tabs-context";

interface SchedulerEvent {
  id: string;
  action: "published" | "unpublished";
  collection: string;
  slug: string;
  title: string;
  timestamp: string;
}

const POLL_INTERVAL = 10_000; // 10 seconds

export function useSchedulerEvents() {
  const lastCheckedRef = useRef(new Date().toISOString());
  const seenIdsRef = useRef(new Set<string>());
  const { updateTabStatusByPath } = useTabs();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/admin/scheduler-events?since=${encodeURIComponent(lastCheckedRef.current)}`);
        if (!res.ok) return;
        const { events } = (await res.json()) as { events: SchedulerEvent[] };

        for (const evt of events) {
          if (seenIdsRef.current.has(evt.id)) continue;
          seenIdsRef.current.add(evt.id);

          // Update tab status dot
          const tabPath = `/admin/${evt.collection}/${evt.slug}`;
          updateTabStatusByPath(tabPath, evt.action === "published" ? "published" : "draft");

          // Show toast
          if (evt.action === "published") {
            toast.success(`Published: ${evt.title}`, {
              description: `${evt.collection}/${evt.slug}`,
              duration: 6000,
            });
          } else {
            toast.info(`Unpublished: ${evt.title}`, {
              description: `${evt.collection}/${evt.slug}`,
              duration: 6000,
            });
          }
        }

        if (events.length > 0) {
          lastCheckedRef.current = events[events.length - 1].timestamp;
        }
      } catch { /* network error, retry next interval */ }
    }

    timer = setInterval(poll, POLL_INTERVAL);

    // Also poll on visibility change (tab becomes visible)
    function onVisibility() {
      if (!document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [updateTabStatusByPath]);
}
