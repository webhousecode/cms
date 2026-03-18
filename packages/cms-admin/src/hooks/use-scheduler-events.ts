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

export function useSchedulerEvents() {
  const { updateTabStatusByPath } = useTabs();
  const updateRef = useRef(updateTabStatusByPath);
  updateRef.current = updateTabStatusByPath;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/admin/scheduler-stream");

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as SchedulerEvent;

          // Update tab status dot
          const tabPath = `/admin/${evt.collection}/${evt.slug}`;
          updateRef.current(tabPath, evt.action === "published" ? "published" : "expired");

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
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 5s
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimer);
      es?.close();
    };
  }, []);
}
