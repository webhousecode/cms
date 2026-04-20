"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTabs } from "@/lib/tabs-context";
import { playPublishSound, playExpireSound } from "@/lib/notification-sound";

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
          const tabPath = `/admin/content/${evt.collection}/${evt.slug}`;
          updateRef.current(tabPath, evt.action === "published" ? "published" : "expired");

          // Play notification sound
          if (evt.action === "published") {
            playPublishSound();
          } else {
            playExpireSound();
          }

          // Show toast
          const time = new Date(evt.timestamp).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });

          if (evt.action === "published") {
            toast.success(`${evt.title}`, {
              description: `Published · ${evt.collection} · ${time}`,
              duration: 8000,
            });
          } else {
            toast.error(`${evt.title}`, {
              description: `Expired · ${evt.collection} · ${time}`,
              duration: 8000,
            });
          }
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        es?.close();
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
