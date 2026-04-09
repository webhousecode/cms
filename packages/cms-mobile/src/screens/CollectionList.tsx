import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Spinner } from "@/components/Spinner";
import { getCollections, getMe } from "@/api/client";
import type { CollectionInfo } from "@/api/types";

const KIND_ICONS: Record<string, string> = {
  page: "📄",
  snippet: "✂️",
  data: "📊",
  form: "📝",
  global: "⚙️",
};

export function CollectionList() {
  const [, params] = useRoute<{ orgId: string; siteId: string }>(
    "/site/:orgId/:siteId/collections",
  );
  const [, setLocation] = useLocation();

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const site = meQuery.data?.sites.find(
    (s) => s.orgId === params?.orgId && s.siteId === params?.siteId,
  );

  const collectionsQuery = useQuery({
    queryKey: ["collections", params?.orgId, params?.siteId],
    queryFn: () => getCollections(params!.orgId, params!.siteId),
    enabled: !!params?.orgId && !!params?.siteId,
  });

  const goBack = useCallback(
    () => setLocation(`/site/${params?.orgId}/${params?.siteId}`),
    [setLocation, params],
  );

  const openCollection = useCallback(
    (col: CollectionInfo) => {
      setLocation(
        `/site/${params!.orgId}/${params!.siteId}/collections/${col.name}`,
      );
    },
    [setLocation, params],
  );

  if (!params) {
    setLocation("/home");
    return null;
  }

  if (collectionsQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader left={<BackButton onClick={goBack} />} title="Content" subtitle={site?.siteName} />
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      </Screen>
    );
  }

  const collections = collectionsQuery.data?.collections ?? [];

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title="Content"
        subtitle={site?.siteName ?? params.siteId}
      />

      <div className="flex flex-1 flex-col gap-2 px-6 pb-24 overflow-auto">
        {collections.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-white/40">No collections configured</p>
          </div>
        ) : (
          collections.map((col) => (
            <button
              key={col.name}
              type="button"
              onClick={() => openCollection(col)}
              className="flex items-center gap-4 rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-4 text-left active:scale-[0.98] active:bg-white/5 transition-all"
            >
              <span className="text-2xl" role="img" aria-label={col.kind}>
                {KIND_ICONS[col.kind] ?? "📄"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{col.label}</p>
                {col.description && (
                  <p className="text-xs text-white/40 truncate mt-0.5">{col.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-white/50 tabular-nums">{col.docCount}</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/30">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))
        )}
      </div>
    </Screen>
  );
}
