import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearProbeCache } from "@/components/SitePreview";

/**
 * Listens for the native pull-to-refresh event dispatched by
 * WebhouseViewController (iOS) or MainActivity (Android) and
 * invalidates all TanStack Query caches + probe cache, triggering
 * a full refetch of /api/mobile/me and re-probe of all preview URLs.
 *
 * Mount this hook once in a top-level authenticated component.
 */
export function usePullToRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    function onNativeRefresh() {
      clearProbeCache();
      queryClient.invalidateQueries();
    }

    window.addEventListener("native-pull-refresh", onNativeRefresh);
    return () => {
      window.removeEventListener("native-pull-refresh", onNativeRefresh);
    };
  }, [queryClient]);
}
