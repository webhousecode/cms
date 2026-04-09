import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Listens for the native pull-to-refresh event dispatched by
 * WebhouseViewController (iOS) or MainActivity (Android) and
 * invalidates all TanStack Query caches, triggering a refetch
 * of /api/mobile/me and any other active queries.
 *
 * Mount this hook once in a top-level authenticated component.
 */
export function usePullToRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    function onNativeRefresh() {
      queryClient.invalidateQueries();
    }

    window.addEventListener("native-pull-refresh", onNativeRefresh);
    return () => {
      window.removeEventListener("native-pull-refresh", onNativeRefresh);
    };
  }, [queryClient]);
}
