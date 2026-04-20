"use client";

import { useEffect, useState } from "react";
import { TabTitle } from "@/lib/tabs-context";
import { SchemaDriftBanner } from "@/components/schema-drift-banner";
import { CollectionListPage } from "@/components/collection-list-page";

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
  readOnly?: boolean;
  urlPrefix?: string;
  urlPattern?: string;
  localeStrategy?: string;
  schemaEnabled?: boolean;
  defaultLocale?: string;
  siteLocales?: string[];
}

export function CollectionPageClient({
  collection, collectionLabel, titleField, fields,
  readOnly, urlPrefix, urlPattern, localeStrategy, schemaEnabled, defaultLocale, siteLocales,
}: Props) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [driftFields, setDriftFields] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Fetch docs and schema drift in parallel
    Promise.all([
      fetch(`/api/cms/collections/${encodeURIComponent(collection)}/documents`).then((r) => r.ok ? r.json() : null),
      fetch("/api/cms/schema-drift").then((r) => r.ok ? r.json() : []),
    ]).then(([fetchedDocs, drift]) => {
      if (cancelled) return;
      const docsArray = Array.isArray(fetchedDocs) ? fetchedDocs : [];
      const sorted = [...(docsArray as Doc[])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setDocs(sorted);

      const colDrift = (drift as Array<{ collection: string; missingFields: string[] }>)
        .find((d) => d.collection === collection);
      if (colDrift) setDriftFields(colDrift.missingFields);
    });

    return () => { cancelled = true; };
  }, [collection]);

  return (
    <>
      <TabTitle value={collectionLabel} />
      {driftFields.length > 0 && (
        <SchemaDriftBanner
          collection={collectionLabel}
          collectionName={collection}
          fields={driftFields}
        />
      )}
      {docs === null ? (
        <div style={{ padding: "2rem", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          Loading documents...
        </div>
      ) : (
        <CollectionListPage
          collection={collection}
          collectionLabel={collectionLabel}
          titleField={titleField}
          fields={fields}
          initialDocs={docs}
          readOnly={readOnly}
          urlPrefix={urlPrefix}
          urlPattern={urlPattern}
          localeStrategy={localeStrategy}
          schemaEnabled={schemaEnabled}
          defaultLocale={defaultLocale}
          siteLocales={siteLocales}
        />
      )}
    </>
  );
}
