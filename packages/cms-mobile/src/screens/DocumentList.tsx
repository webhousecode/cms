import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Spinner } from "@/components/Spinner";
import { getDocuments, getCollections, createDocument } from "@/api/client";
import type { DocumentEntry } from "@/api/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-500/20 text-yellow-400",
  published: "bg-green-500/20 text-green-400",
  archived: "bg-white/10 text-white/40",
};

function docTitle(doc: DocumentEntry): string {
  const d = doc.data;
  return (
    (d.title as string) ||
    (d.name as string) ||
    (d.label as string) ||
    doc.slug
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function DocumentList() {
  const [, params] = useRoute<{ orgId: string; siteId: string; collection: string }>(
    "/site/:orgId/:siteId/collections/:collection",
  );
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const collectionsQuery = useQuery({
    queryKey: ["collections", params?.orgId, params?.siteId],
    queryFn: () => getCollections(params!.orgId, params!.siteId),
    enabled: !!params,
  });

  const docsQuery = useQuery({
    queryKey: ["documents", params?.orgId, params?.siteId, params?.collection],
    queryFn: () => getDocuments(params!.orgId, params!.siteId, params!.collection),
    enabled: !!params,
  });

  const colConfig = collectionsQuery.data?.collections.find(
    (c) => c.name === params?.collection,
  );

  const goBack = useCallback(
    () => setLocation(`/site/${params?.orgId}/${params?.siteId}/collections`),
    [setLocation, params],
  );

  const openDoc = useCallback(
    (doc: DocumentEntry) => {
      setLocation(
        `/site/${params!.orgId}/${params!.siteId}/edit/${params!.collection}/${doc.slug}`,
      );
    },
    [setLocation, params],
  );

  async function handleCreate() {
    if (!params || creating) return;
    setCreating(true);
    try {
      // Generate a slug from timestamp
      const slug = `new-${Date.now().toString(36)}`;
      const doc = await createDocument(params.orgId, params.siteId, params.collection, slug);
      await queryClient.invalidateQueries({
        queryKey: ["documents", params.orgId, params.siteId, params.collection],
      });
      // Navigate directly to the new doc editor
      setLocation(
        `/site/${params.orgId}/${params.siteId}/edit/${params.collection}/${doc.slug}`,
      );
    } catch (err) {
      console.error("Create failed:", err);
    } finally {
      setCreating(false);
    }
  }

  if (!params) {
    setLocation("/home");
    return null;
  }

  if (docsQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader
          left={<BackButton onClick={goBack} />}
          title={colConfig?.label ?? params.collection}
          subtitle="Content"
        />
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      </Screen>
    );
  }

  const documents = docsQuery.data?.documents ?? [];

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title={colConfig?.label ?? params.collection}
        subtitle={`${documents.length} document${documents.length !== 1 ? "s" : ""}`}
        right={
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold text-brand-dark active:scale-90 transition-transform disabled:opacity-50"
            aria-label="New document"
          >
            {creating ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-2 px-6 pb-24 overflow-auto">
        {documents.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-white/40">No documents yet</p>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="text-sm text-brand-gold active:opacity-70"
            >
              {creating ? "Creating..." : "Create first document"}
            </button>
          </div>
        ) : (
          documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => openDoc(doc)}
              className="flex items-center gap-3 rounded-xl bg-brand-darkSoft border border-white/10 px-4 py-3.5 text-left active:scale-[0.98] active:bg-white/5 transition-all"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{docTitle(doc)}</p>
                <p className="text-xs text-white/35 mt-0.5 truncate">{doc.slug}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[doc.status] ?? STATUS_COLORS.draft}`}>
                  {doc.status}
                </span>
                {doc.updatedAt && (
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {formatDate(doc.updatedAt)}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </Screen>
  );
}
