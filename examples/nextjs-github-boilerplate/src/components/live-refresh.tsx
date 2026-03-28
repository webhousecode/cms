"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * LiveRefresh — auto-refreshes the page when CMS content changes.
 * Connects to /api/content-stream SSE endpoint.
 * Only active in development or when NEXT_PUBLIC_LIVE_REFRESH=true.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_LIVE_REFRESH !== "true"
    ) {
      return;
    }

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/content-stream");

      es.onmessage = () => {
        router.refresh();
      };

      es.onerror = () => {
        es?.close();
        // Retry after 5s
        retryTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimeout);
    };
  }, [router]);

  return null;
}
