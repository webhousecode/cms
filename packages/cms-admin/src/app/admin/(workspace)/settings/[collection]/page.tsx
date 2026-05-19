export const dynamic = "force-dynamic";

import { getAdminConfig } from "@/lib/cms";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CollectionSchemaEditor } from "@/components/schema/collection-schema-editor";
import { PageHeader } from "@/components/page-header";

type Props = { params: Promise<{ collection: string }>; searchParams: Promise<{ from?: string }> };

export default async function EditCollectionPage({ params, searchParams }: Props) {
  const { collection } = await params;
  const { from } = await searchParams;

  // Admin only — editors cannot edit schemas even if they know the URL.
  // schemaEditEnabled flag is for granting NON-admin editors access; admin
  // always passes (Christian's rule 2026-05-19).
  const { getSiteRole } = await import("@/lib/require-role");
  const role = await getSiteRole();
  if (role !== "admin") redirect("/admin");
  const config = await getAdminConfig();

  if (collection === "new") {
    return (
      <>
        <PageHeader>
          <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
          <span className="text-sm text-muted-foreground font-mono">settings / new collection</span>
        </PageHeader>
        <div className="p-8 max-w-3xl">
          <CollectionSchemaEditor isNew />
        </div>
      </>
    );
  }

  const col = config.collections.find((c) => c.name === collection);
  if (!col) notFound();

  return (
    <>
      <PageHeader>
        <Link href={from === "settings" ? "/admin/settings?tab=schema" : `/admin/content/${col.name}`} className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-sm text-muted-foreground font-mono">{from === "settings" ? `settings / schema / ${col.name}` : `${col.label ?? col.name} / schema`}</span>
      </PageHeader>
      <div className="p-8 max-w-3xl">
        <CollectionSchemaEditor
          collection={{
            name: col.name,
            label: col.label,
            urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
            fields: col.fields,
          }}
        />
      </div>
    </>
  );
}
