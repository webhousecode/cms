"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LayoutGrid, List, Edit2 } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { CollectionList, type ViewMode } from "@/components/collection-list";
import { NewDocumentButton } from "@/components/new-document-button";
import { GenerateDocumentButton } from "@/components/generate-document-button";

interface FieldConfig {
  name: string;
  type: string;
  label?: string;
}

interface Doc {
  id: string;
  slug: string;
  status: string;
  publishAt?: string;
  unpublishAt?: string;
  updatedAt: string;
  data: Record<string, unknown>;
  locale?: string;
  translationOf?: string;
  translationGroup?: string;
}

interface Props {
  collection: string;
  collectionLabel: string;
  titleField: string;
  fields: FieldConfig[];
  initialDocs: Doc[];
  readOnly?: boolean;
  urlPrefix?: string;
  urlPattern?: string;
  schemaEnabled?: boolean;
  defaultLocale?: string;
  siteLocales?: string[];
}

export function CollectionListPage({
  collection, collectionLabel, titleField, fields, initialDocs,
  readOnly, urlPrefix, urlPattern, schemaEnabled, defaultLocale, siteLocales,
}: Props) {
  const storageKey = `cms-view-${collection}`;
  const [view, setView] = useState<ViewMode>("list");

  // Restore saved preference after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === "grid" || saved === "list") setView(saved);
  }, [storageKey]);

  function changeView(v: ViewMode) {
    setView(v);
    localStorage.setItem(storageKey, v);
  }

  return (
    <>
      <ActionBar helpArticleId="collection-list-intro"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* View toggle */}
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
              {(["grid", "list"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeView(v)}
                  style={{
                    padding: "0.25rem 0.5rem", background: view === v ? "var(--accent)" : "transparent",
                    border: "none", cursor: "pointer", color: view === v ? "var(--foreground)" : "var(--muted-foreground)",
                    display: "flex", alignItems: "center",
                  }}
                  title={v === "grid" ? "Grid view" : "List view"}
                >
                  {v === "grid" ? <LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} /> : <List style={{ width: "0.875rem", height: "0.875rem" }} />}
                </button>
              ))}
            </div>

            {!readOnly && (
              <>
                {schemaEnabled && (
                  <Link href={`/admin/settings/${collection}`}>
                    <button type="button" style={{
                      height: "28px", display: "inline-flex", alignItems: "center", gap: "0.35rem",
                      padding: "0 0.65rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500,
                      background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)",
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                      <Edit2 style={{ width: 14, height: 14 }} />
                      Edit schema
                    </button>
                  </Link>
                )}
                <GenerateDocumentButton collection={collection} collectionLabel={collectionLabel} />
                <NewDocumentButton collection={collection} titleField={titleField} defaultLocale={defaultLocale} siteLocales={siteLocales} />
              </>
            )}
          </div>
        }
      >
        <ActionBarBreadcrumb items={[collectionLabel]} />
      </ActionBar>

      <div style={{ padding: "2rem", maxWidth: "88rem" }}>
        <CollectionList
          collection={collection}
          titleField={titleField}
          fields={fields}
          initialDocs={initialDocs}
          readOnly={readOnly}
          view={view}
          urlPrefix={urlPrefix}
          urlPattern={urlPattern}
          defaultLocale={defaultLocale}
          siteLocales={siteLocales}
        />
      </div>
    </>
  );
}
